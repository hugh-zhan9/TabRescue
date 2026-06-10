import { Snapshot, SnapshotDetail, SnapshotSummary, CurrentSession, TabData } from '../types';
import { StorageRepository } from '../repository/types';

export interface SessionSnapshotSource {
  getCurrentSession(): CurrentSession | null;
  fullCapture(): Promise<CurrentSession>;
}

export interface CreateSnapshotOptions {
  refreshCurrentState?: boolean;
  skipIfUnchanged?: boolean;
}

/**
 * 快照服务
 * 负责快照的生成、管理和清理
 */
export class SnapshotService {
  private repository: StorageRepository;
  private readonly sessionSource: SessionSnapshotSource;

  constructor(repository: StorageRepository, sessionSource: SessionSnapshotSource) {
    this.repository = repository;
    this.sessionSource = sessionSource;
  }

  /**
   * 创建快照
   * 从 extension 内存态复制数据到 snapshots 归档
   */
  public async createSnapshot(options?: CreateSnapshotOptions): Promise<Snapshot> {
    if (options?.refreshCurrentState) {
      await this.sessionSource.fullCapture();
    }

    const session = this.sessionSource.getCurrentSession();
    if (!session) {
      throw new Error('No current session to snapshot');
    }

    const snapshotId = this.generateId();
    const now = Date.now();

    // 过滤已删除的标签页
    const activeTabs = session.tabs.filter((t) => !t.deletedAt);
    if (activeTabs.length === 0) {
      throw new Error('No active tabs to snapshot');
    }

    // 按窗口分组统计
    const windowTabs = new Map<string, typeof activeTabs>();
    for (const tab of activeTabs) {
      const tabs = windowTabs.get(tab.windowId) || [];
      tabs.push(tab);
      windowTabs.set(tab.windowId, tabs);
    }

    const snapshot: SnapshotDetail = {
      id: snapshotId,
      createdAt: now,
      windowCount: session.windows.length,
      tabCount: activeTabs.length,
      summary: this.generateSummary(session, windowTabs, now),
      windows: session.windows.map((window) => ({ ...window })),
      tabs: activeTabs.map((tab) => ({ ...tab })),
    };

    const settings = await this.repository.getSettings();
    if (options?.skipIfUnchanged) {
      const latestEquivalent = await this.getLatestEquivalentSnapshot(snapshot, settings.snapshot?.retentionHours);
      if (latestEquivalent) {
        await this.enforceSnapshotRetention(settings.snapshot?.retentionHours);
        return latestEquivalent;
      }
    }

    await this.repository.saveSnapshot(snapshot);

    // 清理超过保留时间的快照
    await this.enforceSnapshotRetention(settings.snapshot?.retentionHours);

    return snapshot;
  }

  /**
   * 获取快照列表
   */
  public async getSnapshots(limit: number = 20): Promise<Snapshot[]> {
    return this.repository.getSnapshots(limit);
  }

  /**
   * 获取快照详情
   */
  public async getSnapshotDetail(id: string): Promise<SnapshotDetail | null> {
    return this.repository.getSnapshotDetail(id);
  }

  /**
   * 删除快照
   */
  public async deleteSnapshot(id: string): Promise<void> {
    await this.repository.deleteSnapshot(id);
  }

  /**
   * 生成快照摘要
   */
  private generateSummary(
    session: CurrentSession,
    windowTabs: Map<string, TabData[]>,
    createdAt: number
  ): SnapshotSummary {
    const windows = session.windows.map((w) => {
      const tabs = windowTabs.get(w.windowId) || [];
      return {
        windowId: w.windowId,
        windowType: w.windowType,
        tabCount: tabs.length,
        representativeTabs: tabs.slice(0, 3).map((t) => t.title || t.url),
      };
    });

    return {
      createdAt,
      windows,
    };
  }

  private getSnapshotSignature(snapshot: Pick<SnapshotDetail, 'windows' | 'tabs'>): string {
    const windowPositions = new Map(
      snapshot.windows
        .slice()
        .sort((left, right) => left.snapIndex - right.snapIndex)
        .map((window, index) => [window.windowId, index])
    );

    return snapshot.tabs
      .filter((tab) => !tab.deletedAt)
      .slice()
      .sort((left, right) => {
        const leftWindow = windowPositions.get(left.windowId) ?? Number.MAX_SAFE_INTEGER;
        const rightWindow = windowPositions.get(right.windowId) ?? Number.MAX_SAFE_INTEGER;
        if (leftWindow !== rightWindow) return leftWindow - rightWindow;
        if (left.tabIndex !== right.tabIndex) return left.tabIndex - right.tabIndex;
        return left.url.localeCompare(right.url);
      })
      .map((tab) => {
        const windowPosition = windowPositions.get(tab.windowId) ?? -1;
        return [windowPosition, tab.tabIndex, tab.isPinned ? 1 : 0, tab.url].join('\t');
      })
      .join('\n');
  }

  private async getLatestEquivalentSnapshot(
    snapshot: SnapshotDetail,
    retentionHours?: number
  ): Promise<Snapshot | null> {
    const latest = (await this.repository.getSnapshots(1))[0];
    if (!latest) {
      return null;
    }

    const retentionMs = (retentionHours ?? 24) * 60 * 60 * 1000;
    if (Date.now() - latest.createdAt >= retentionMs) {
      return null;
    }

    const detail = await this.repository.getSnapshotDetail(latest.id);
    if (!detail) {
      return null;
    }

    return this.getSnapshotSignature(snapshot) === this.getSnapshotSignature(detail)
      ? latest
      : null;
  }

  /**
   * 清理超过保留时间的快照
   */
  public async enforceSnapshotRetention(retentionHours?: number) {
    const configuredRetentionHours = (await this.repository.getSettings()).snapshot?.retentionHours;
    const hours = retentionHours ?? configuredRetentionHours ?? 24;
    const cutoff = Date.now() - hours * 60 * 60 * 1000;

    const snapshots = await this.getSnapshots(1000);
    const expired = snapshots.filter((snapshot) => snapshot.createdAt < cutoff);
    for (const snapshot of expired) {
      await this.deleteSnapshot(snapshot.id);
    }
  }

  /**
   * @deprecated maxSnapshots 现在表示展示数量；实际清理由 retentionHours 控制。
   */
  public async enforceSnapshotLimit() {
    await this.enforceSnapshotRetention();
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

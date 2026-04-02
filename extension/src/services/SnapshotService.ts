import { Snapshot, SnapshotDetail, SnapshotSummary, CurrentSession, TabData } from '../types';
import { StorageRepository } from '../repository/types';

/**
 * 快照服务
 * 负责快照的生成、管理和清理
 */
export class SnapshotService {
  private repository: StorageRepository;

  constructor(repository: StorageRepository) {
    this.repository = repository;
  }

  /**
   * 创建快照
   * 从 currentSession 复制数据到 snapshots 归档
   */
  public async createSnapshot(): Promise<Snapshot> {
    const session = await this.repository.getCurrentSession();
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
      windows: session.windows,
      tabs: activeTabs,
    };

    await this.repository.saveSnapshot(snapshot);

    // 清理过期快照
    await this.cleanupOldSnapshots();

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

  /**
   * 清理过期快照
   */
  private async cleanupOldSnapshots() {
    const settings = await this.repository.getSettings();
    const maxSnapshots = settings.snapshot?.maxSnapshots || 20;

    const snapshots = await this.getSnapshots(100);
    if (snapshots.length > maxSnapshots) {
      const toDelete = snapshots.slice(maxSnapshots);
      for (const snapshot of toDelete) {
        await this.deleteSnapshot(snapshot.id);
      }
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

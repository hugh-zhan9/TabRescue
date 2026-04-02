import { SnapshotDetail, RecoveryResult } from '../types';
import { StorageRepository } from '../repository/types';
import { isRestorableUrl } from '../utils/urlFilter';

/**
 * 恢复服务
 * 负责会话恢复的执行
 */
export class RecoveryService {
  private repository: StorageRepository;
  private isRestoring = false;
  private lastRestoredSnapshotId: string | null = null;
  private lastRestoredAt: number | null = null;

  constructor(repository: StorageRepository) {
    this.repository = repository;
  }

  /**
   * 恢复快照
   */
  public async restoreSnapshot(
    snapshotId: string,
    options?: { force?: boolean }
  ): Promise<RecoveryResult> {
    // 幂等保护：防止并发恢复
    if (this.isRestoring) {
      throw new Error('Recovery already in progress');
    }

    // 检查重复恢复（5 分钟内）
    const now = Date.now();
    if (
      !options?.force &&
      this.lastRestoredSnapshotId === snapshotId &&
      this.lastRestoredAt &&
      now - this.lastRestoredAt < 5 * 60 * 1000
    ) {
      throw new Error('Recently restored. Confirm to restore again.');
    }

    this.isRestoring = true;

    try {
      const snapshot = await this.repository.getSnapshotDetail(snapshotId);
      if (!snapshot) {
        throw new Error('Snapshot not found');
      }

      return await this.executeRecovery(snapshot, options, snapshotId, now);
    } finally {
      this.isRestoring = false;
    }
  }

  /**
   * 执行恢复
   */
  private async executeRecovery(
    snapshot: SnapshotDetail,
    _options?: { force?: boolean },
    restoreKey?: string,
    restoreAt?: number
  ): Promise<RecoveryResult> {
    const result: RecoveryResult = {
      success: true,
      windowsCreated: 0,
      tabsCreated: 0,
      failedTabs: [],
    };

    // 在恢复之前记录当前存在的空白窗口
    const emptyWindowsToClose = await this.getEmptyDefaultWindows();

    // 按窗口恢复
    for (const window of snapshot.windows) {
      const windowTabs = snapshot.tabs.filter(
        (t) => t.windowId === window.windowId
      );

      if (windowTabs.length === 0) continue;

      const invalidTabs = windowTabs.filter((tab) => !isRestorableUrl(tab.url));
      for (const tab of invalidTabs) {
        result.failedTabs.push({
          url: tab.url,
          reason: 'URL is not restorable',
        });
      }

      const restorableTabs = windowTabs
        .filter((tab) => isRestorableUrl(tab.url))
        .slice()
        .sort((a, b) => a.tabIndex - b.tabIndex);

      if (restorableTabs.length === 0) {
        continue;
      }

      try {
        // 创建新窗口，同时打开第一个标签页（避免创建空白页）
        const firstTab = restorableTabs[0];
        const chromeWindow = await chrome.windows.create({
          type: 'normal',
          focused: false,
          url: firstTab.url,
        });

        result.windowsCreated++;

        // 更新第一个标签页的 pinned 状态（如果需要）
        if (firstTab.isPinned && chromeWindow.tabs?.[0]?.id) {
          await chrome.tabs.update(chromeWindow.tabs[0].id, { pinned: true });
        }

        // 创建剩余标签页（从第二个开始）
        for (let i = 1; i < restorableTabs.length; i++) {
          const tab = restorableTabs[i];
          try {
            await chrome.tabs.create({
              windowId: chromeWindow.id,
              url: tab.url,
              active: i === restorableTabs.length - 1, // 最后一个标签激活
              pinned: tab.isPinned,
            });
            result.tabsCreated++;
          } catch (err) {
            result.failedTabs.push({
              url: tab.url,
              reason: (err as Error).message,
            });
          }
        }

        // 第一个标签页也算创建成功
        result.tabsCreated++;
      } catch (err) {
        // 窗口创建失败，记录所有该窗口的标签
        for (const tab of restorableTabs) {
          result.failedTabs.push({
            url: tab.url,
            reason: `Window creation failed: ${(err as Error).message}`,
          });
        }
      }
    }

    // 只关闭恢复前存在的空白窗口
    for (const windowId of emptyWindowsToClose) {
      try {
        await chrome.windows.remove(windowId);
      } catch (err) {
        // 忽略错误（窗口可能已被用户关闭）
      }
    }

    if (restoreKey) {
      this.lastRestoredSnapshotId = restoreKey;
    }
    if (restoreAt) {
      this.lastRestoredAt = restoreAt;
    }

    return result;
  }

  /**
   * 获取当前的空白默认窗口 ID 列表
   */
  private async getEmptyDefaultWindows(): Promise<number[]> {
    const emptyWindows: number[] = [];
    try {
      const windows = await chrome.windows.getAll({ populate: true });

      for (const win of windows) {
        if (win.type !== 'normal') continue;

        const tabs = win.tabs || [];
        if (tabs.length === 1) {
          const tab = tabs[0];
          const url = tab.url || '';
          if (
            url === 'chrome://newtab' ||
            url === 'about:newtab' ||
            url === 'about:blank'
          ) {
            emptyWindows.push(win.id!);
          }
        }
      }
    } catch (err) {
      // 忽略错误
    }
    return emptyWindows;
  }

  /**
   * 获取恢复进度
   */
  public getRecoveryProgress(): {
    isRestoring: boolean;
    lastRestoredSnapshotId: string | null;
    lastRestoredAt: number | null;
  } {
    return {
      isRestoring: this.isRestoring,
      lastRestoredSnapshotId: this.lastRestoredSnapshotId,
      lastRestoredAt: this.lastRestoredAt,
    };
  }
}

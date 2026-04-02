import { StorageRepository } from './types';
import {
  CurrentSession,
  Snapshot,
  SnapshotDetail,
  Settings,
  WindowData,
  TabData,
} from '../types';

/**
 * Level 1 Repository - 使用 chrome.storage.local 存储
 * 适用于轻量级用户，零配置，开箱即用
 */
export class Level1Repository implements StorageRepository {
  private STORAGE_KEY_CURRENT = 'currentSession';
  private STORAGE_KEY_SNAPSHOTS = 'snapshots';
  private STORAGE_KEY_SETTINGS = 'settings';

  getStorageLevel(): number {
    return 1;
  }

  async getCurrentSession(): Promise<CurrentSession | null> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY_CURRENT);
    return result[this.STORAGE_KEY_CURRENT] || null;
  }

  async saveCurrentSession(session: CurrentSession): Promise<void> {
    await chrome.storage.local.set({
      [this.STORAGE_KEY_CURRENT]: session,
    });
  }

  /**
   * 采集当前浏览器状态并保存
   * 用作 getCurrentSession 为空时的兜底补采
   */
  async capture(): Promise<void> {
    const windows = await chrome.windows.getAll({ populate: true });

    const sessionWindows: WindowData[] = windows.map((w, idx) => ({
      windowId: w.id!.toString(),
      windowType: w.type || 'normal',
      isFocused: w.focused || false,
      snapIndex: idx,
    }));

    const sessionTabs: TabData[] = [];
    for (const win of windows) {
      for (const tab of win.tabs || []) {
        if (tab.incognito) continue;
        if (!tab.url) continue;
        const excluded = ['chrome://', 'about:', 'edge://', 'moz://', 'chrome-extension://', 'moz-extension://', 'chrome-newtab://', 'data:', 'javascript:', 'view-source:'];
        if (excluded.some((p) => tab.url!.startsWith(p))) continue;

        sessionTabs.push({
          url: tab.url!,
          windowId: win.id!.toString(),
          title: tab.title,
          tabIndex: tab.index,
          isPinned: tab.pinned || false,
          openedAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
        });
      }
    }

    await this.saveCurrentSession({
      id: 'singleton',
      updatedAt: Date.now(),
      windows: sessionWindows,
      tabs: sessionTabs,
    });
  }

  async getSnapshots(limit: number = 20): Promise<Snapshot[]> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY_SNAPSHOTS);
    const snapshots = result[this.STORAGE_KEY_SNAPSHOTS] || [];
    return snapshots
      .sort((a: Snapshot, b: Snapshot) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async getSnapshotDetail(id: string): Promise<SnapshotDetail | null> {
    const snapshots = await this.getSnapshots(100);
    return (snapshots.find((s) => s.id === id) as SnapshotDetail) || null;
  }

  async saveSnapshot(snapshot: SnapshotDetail): Promise<void> {
    const snapshots = await this.getSnapshots(100);
    snapshots.unshift(snapshot);
    await chrome.storage.local.set({
      [this.STORAGE_KEY_SNAPSHOTS]: snapshots,
    });
  }

  async deleteSnapshot(id: string): Promise<void> {
    const snapshots = await this.getSnapshots(100);
    const filtered = snapshots.filter((s) => s.id !== id);
    await chrome.storage.local.set({
      [this.STORAGE_KEY_SNAPSHOTS]: filtered,
    });
  }

  async getSettings(): Promise<Settings> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY_SETTINGS);
    return result[this.STORAGE_KEY_SETTINGS] || this.getDefaultSettings();
  }

  async saveSettings(settings: Settings): Promise<void> {
    await chrome.storage.local.set({
      [this.STORAGE_KEY_SETTINGS]: settings,
    });
  }

  private getDefaultSettings(): Settings {
    return {
      dedup: { strategy: 'per-window' },
      storage: { level: 1 },
      snapshot: { maxSnapshots: 20, autoSaveInterval: 5 },
      ui: { showRecoveryPromptOnStartup: false },
    };
  }
}

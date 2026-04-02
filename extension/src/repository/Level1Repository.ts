import { StorageRepository } from './types';
import {
  Snapshot,
  SnapshotDetail,
  Settings,
} from '../types';

/**
 * Level 1 Repository - 使用 chrome.storage.local 存储
 * 适用于轻量级用户，零配置，开箱即用
 */
export class Level1Repository implements StorageRepository {
  private STORAGE_KEY_SNAPSHOTS = 'snapshots';
  private STORAGE_KEY_SETTINGS = 'settings';

  getStorageLevel(): number {
    return 1;
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

  async getPopupState(limit: number = 20): Promise<{ snapshots: Snapshot[]; settings: Settings }> {
    const result = await chrome.storage.local.get([
      this.STORAGE_KEY_SNAPSHOTS,
      this.STORAGE_KEY_SETTINGS,
    ]);
    const snapshots = ((result[this.STORAGE_KEY_SNAPSHOTS] || []) as Snapshot[])
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
    const settings = this.mergeSettings(result[this.STORAGE_KEY_SETTINGS] as Settings | undefined);
    return { snapshots, settings };
  }

  async getSettings(): Promise<Settings> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY_SETTINGS);
    return this.mergeSettings(result[this.STORAGE_KEY_SETTINGS] as Settings | undefined);
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

  private mergeSettings(saved?: Partial<Settings>): Settings {
    const defaults = this.getDefaultSettings();
    return {
      ...defaults,
      ...saved,
      dedup: {
        ...defaults.dedup,
        ...(saved?.dedup || {}),
      },
      storage: {
        ...defaults.storage,
        ...(saved?.storage || {}),
      },
      snapshot: {
        ...defaults.snapshot,
        ...(saved?.snapshot || {}),
      },
      ui: {
        ...defaults.ui,
        ...(saved?.ui || {}),
      },
    };
  }
}

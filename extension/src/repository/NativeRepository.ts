import { StorageRepository } from './types';
import { StorageLevel } from '../types';
import {
  CurrentSession,
  Snapshot,
  SnapshotDetail,
  Settings,
} from '../types';

/**
 * Native Repository - 通过 Native Messaging 与宿主程序通信
 * 适用于 Level 2 (SQLite) 和 Level 3 (PostgreSQL/MySQL)
 */
export class NativeRepository implements StorageRepository {
  private level: StorageLevel;
  private hostName: string;

  constructor(level: StorageLevel) {
    this.level = level;
    // 不同的存储级别使用不同的 native host
    this.hostName = level === 2 ? 'com.tabrescue.sqlite-host' : 'com.tabrescue.native-host';
  }

  getStorageLevel(): StorageLevel {
    return this.level;
  }

  private async sendMessage(action: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendNativeMessage(this.hostName, { action, params }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Native host 通信失败: ${chrome.runtime.lastError.message}`));
          } else if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || `Native host 操作失败: ${action}`));
          }
        });
      } catch (err) {
        reject(new Error(`Native host 通信异常: ${(err as Error).message}`));
      }
    });
  }

  async getCurrentSession(): Promise<CurrentSession | null> {
    return (await this.sendMessage('get_current_session')) as CurrentSession | null;
  }

  async saveCurrentSession(session: CurrentSession): Promise<void> {
    await this.sendMessage('save_current_session', { session });
  }

  async capture(): Promise<void> {
    // 采集逻辑由 extension 侧直接写入 bootstrapRepository，这里同步到当前 level 仓库
    const session = await this.sendMessage('get_current_session');
    if (session) {
      await this.sendMessage('save_current_session', { session });
    }
  }

  async getSnapshots(limit: number = 20): Promise<Snapshot[]> {
    return (await this.sendMessage('get_snapshots', { limit })) as Snapshot[];
  }

  async getSnapshotDetail(id: string): Promise<SnapshotDetail | null> {
    return (await this.sendMessage('get_snapshot_detail', { id })) as SnapshotDetail | null;
  }

  async saveSnapshot(snapshot: SnapshotDetail): Promise<void> {
    await this.sendMessage('save_snapshot', { snapshot });
  }

  async deleteSnapshot(id: string): Promise<void> {
    await this.sendMessage('delete_snapshot', { id });
  }

  async getSettings(): Promise<Settings> {
    const defaults: Settings = {
      dedup: { strategy: 'per-window' },
      storage: { level: this.level },
      snapshot: { maxSnapshots: 20, autoSaveInterval: 5 },
      ui: { showRecoveryPromptOnStartup: false },
    };

    try {
      const saved = await this.sendMessage('get_settings');
      return { ...defaults, ...(saved as Partial<Settings>) };
    } catch (err) {
      console.error('[NativeRepository] getSettings failed:', err);
      return defaults;
    }
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.sendMessage('save_settings', { settings });
  }
}

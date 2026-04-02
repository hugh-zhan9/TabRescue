import { StorageRepository } from './types';
import { StorageLevel } from '../types';
import {
  Snapshot,
  SnapshotDetail,
  Settings,
} from '../types';

/**
 * Native Repository - 通过 Native Messaging 与宿主程序通信
 * 适用于 Level 2 (SQLite) 和 Level 3 (PostgreSQL/MySQL)
 */
export class NativeRepository implements StorageRepository {
  private static readonly HOST_NAME = 'com.tabrescue.native_host';
  private level: StorageLevel;
  private hostName: string;
  private readonly browserScope: 'chrome' | 'edge' | 'firefox' | 'unknown';

  constructor(level: StorageLevel) {
    this.level = level;
    this.hostName = NativeRepository.HOST_NAME;
    this.browserScope = this.detectBrowserScope();
  }

  private detectBrowserScope(): 'chrome' | 'edge' | 'firefox' | 'unknown' {
    const userAgent = navigator.userAgent || '';

    if (userAgent.includes('Firefox/')) {
      return 'firefox';
    }

    if (userAgent.includes('Edg/')) {
      return 'edge';
    }

    if (userAgent.includes('Chrome/')) {
      return 'chrome';
    }

    return 'unknown';
  }

  getStorageLevel(): StorageLevel {
    return this.level;
  }

  private getDefaultSettings(): Settings {
    return {
      dedup: { strategy: 'per-window' },
      storage: { level: this.level },
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

  private async getBootstrapSettingsFallback(): Promise<Settings> {
    try {
      const result = await chrome.storage.local.get('settings');
      const saved = result.settings as Settings | undefined;
      return this.mergeSettings(saved);
    } catch {
      return this.getDefaultSettings();
    }
  }

  private getHostSetupHint(): string {
    if (this.level === 2) {
      return '未检测到 Level 2 Native Host，请先安装并注册 SQLite 宿主程序。';
    }

    return '未检测到 Level 3 Native Host，请先安装宿主程序并确认远程数据库连接配置。';
  }

  private normalizeNativeErrorMessage(message: string): string {
    const lower = message.toLowerCase();

    if (
      lower.includes('specifies a native messaging host that was not found') ||
      lower.includes('native host has exited') ||
      lower.includes('host not found')
    ) {
      return this.getHostSetupHint();
    }

    if (
      lower.includes('access to the native messaging host was forbidden') ||
      lower.includes('not allowed')
    ) {
      return '当前浏览器未允许访问 Native Messaging 宿主程序，请检查扩展安装方式和浏览器权限。';
    }

    if (lower.includes('unsupported') || lower.includes('not supported')) {
      return '当前浏览器环境不支持 Native Messaging，无法使用 Level 2/3 数据源。';
    }

    return `Native host 通信失败: ${message}`;
  }

  private async sendMessage(action: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      try {
        if (typeof chrome === 'undefined' || !chrome.runtime?.sendNativeMessage) {
          reject(new Error('当前环境不支持 Native Messaging，请在支持的扩展环境中使用 Level 2/3 数据源。'));
          return;
        }

        chrome.runtime.sendNativeMessage(this.hostName, {
          action,
          params,
          context: {
            browserScope: this.browserScope,
          },
        }, (response) => {
          if (chrome.runtime.lastError) {
            const message = chrome.runtime.lastError.message || '未知 Native Messaging 错误';
            reject(new Error(this.normalizeNativeErrorMessage(message)));
          } else if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || `Native host 操作失败: ${action}`));
          }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reject(new Error(this.normalizeNativeErrorMessage(message)));
      }
    });
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

  async getPopupState(limit: number = 20): Promise<{ snapshots: Snapshot[]; settings: Settings }> {
    try {
      const result = await this.sendMessage('get_popup_state', { limit }) as {
        snapshots?: Snapshot[];
        settings?: Partial<Settings>;
      };
      return {
        snapshots: result.snapshots || [],
        settings: this.mergeSettings(result.settings),
      };
    } catch (err) {
      console.error('[NativeRepository] getPopupState failed:', err);
      const settings = await this.getBootstrapSettingsFallback();
      return { snapshots: [], settings };
    }
  }

  async getSettings(): Promise<Settings> {
    try {
      const saved = await this.sendMessage('get_settings');
      return this.mergeSettings(saved as Partial<Settings>);
    } catch (err) {
      console.error('[NativeRepository] getSettings failed:', err);
      return this.getBootstrapSettingsFallback();
    }
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.sendMessage('save_settings', { settings });
  }
}

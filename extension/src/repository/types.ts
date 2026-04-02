import {
  CurrentSession,
  Snapshot,
  SnapshotDetail,
  Settings,
} from '../types';

/**
 * 存储仓库接口
 * 定义了存储层的抽象，业务逻辑层通过此接口与存储交互
 */
export interface StorageRepository {
  // 获取存储级别
  getStorageLevel(): number;

  // CurrentSession
  getCurrentSession(): Promise<CurrentSession | null>;
  saveCurrentSession(session: CurrentSession): Promise<void>;
  capture(): Promise<void>;

  // Snapshots
  getSnapshots(limit?: number): Promise<Snapshot[]>;
  getSnapshotDetail(id: string): Promise<SnapshotDetail | null>;
  saveSnapshot(snapshot: SnapshotDetail): Promise<void>;
  deleteSnapshot(id: string): Promise<void>;

  // Settings
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
}

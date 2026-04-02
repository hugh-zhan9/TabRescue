/** 去重策略 */
export type DedupStrategy = 'strict' | 'per-window' | 'none';

/** 存储模式 */
export type StorageLevel = 1 | 2 | 3;

/** 数据库配置 */
export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

/** 用户配置 */
export interface Settings {
  dedup: {
    strategy: DedupStrategy;
  };
  storage: {
    level: StorageLevel;
    sqlite?: { path: string };
    postgresql?: DbConfig;
    mysql?: DbConfig;
  };
  snapshot: {
    maxSnapshots: number;
    autoSaveInterval: number; // 分钟，0=仅事件触发
  };
  ui: {
    showRecoveryPromptOnStartup: boolean;
  };
}

/** 窗口数据 */
export interface WindowData {
  windowId: string;
  windowType: string;
  isFocused: boolean;
  snapIndex: number;
}

/** 标签页数据 */
export interface TabData {
  id?: string;
  url: string;
  windowId: string;
  title?: string;
  tabIndex: number;
  isPinned: boolean;
  openedAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

/** 当前会话（实时主数据） */
export interface CurrentSession {
  id: 'singleton';
  updatedAt: number;
  windows: WindowData[];
  tabs: TabData[];
}

/** 快照摘要 */
export interface SnapshotSummary {
  createdAt: number;
  windows: Array<{
    windowId: string;
    windowType: string;
    tabCount: number;
    representativeTabs: string[];
  }>;
}

/** 快照（历史归档） */
export interface Snapshot {
  id: string;
  createdAt: number;
  windowCount: number;
  tabCount: number;
  summary: SnapshotSummary;
}

/** 快照详情（用于恢复） */
export interface SnapshotDetail extends Snapshot {
  windows: WindowData[];
  tabs: TabData[];
}

/** 恢复结果 */
export interface RecoveryResult {
  success: boolean;
  windowsCreated: number;
  tabsCreated: number;
  failedTabs: Array<{ url: string; reason: string }>;
}

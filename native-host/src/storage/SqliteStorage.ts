import DatabaseLib from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';

type Database = DatabaseLib.Database;

/**
 * SQLite 存储管理器
 * 使用 better-sqlite3 进行本地存储
 */
export class SqliteStorage {
  private db: Database | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(homedir(), '.tabrescue', 'data.db');
  }

  async initialize(): Promise<void> {
    // 确保目录存在
    const dir = join(this.dbPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // 动态导入 better-sqlite3
    const Database = (await import('better-sqlite3')).default;
    this.db = new Database(this.dbPath) as unknown as Database;

    // 启用 WAL 模式
    this.db!.pragma('journal_mode = WAL');

    // 创建表
    this.createTables();
  }

  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
      -- 当前会话元信息
      CREATE TABLE IF NOT EXISTS current_session (
        id TEXT PRIMARY KEY CHECK (id = 'singleton'),
        updatedAt INTEGER NOT NULL,
        windowCount INTEGER NOT NULL,
        tabCount INTEGER NOT NULL
      );

      -- 当前窗口表
      CREATE TABLE IF NOT EXISTS current_windows (
        id TEXT PRIMARY KEY,
        windowId TEXT NOT NULL UNIQUE,
        windowType TEXT,
        isFocused BOOLEAN DEFAULT FALSE,
        snapIndex INTEGER
      );

      -- 当前标签页表（支持多种去重策略）
      CREATE TABLE IF NOT EXISTS current_tabs (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        windowId TEXT NOT NULL,
        title TEXT,
        tabIndex INTEGER NOT NULL,
        isPinned BOOLEAN DEFAULT FALSE,
        openedAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        deletedAt INTEGER
      );

      -- 快照主表
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        createdAt INTEGER NOT NULL,
        windowCount INTEGER NOT NULL,
        tabCount INTEGER NOT NULL,
        summary TEXT
      );

      -- 快照窗口表
      CREATE TABLE IF NOT EXISTS snapshot_windows (
        id TEXT PRIMARY KEY,
        snapshotId TEXT NOT NULL,
        windowId TEXT NOT NULL,
        windowType TEXT,
        isFocused BOOLEAN DEFAULT FALSE,
        snapIndex INTEGER,
        FOREIGN KEY (snapshotId) REFERENCES snapshots(id)
      );

      -- 快照标签页表
      CREATE TABLE IF NOT EXISTS snapshot_tabs (
        id TEXT PRIMARY KEY,
        snapshotId TEXT NOT NULL,
        windowId TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT,
        tabIndex INTEGER NOT NULL,
        isPinned BOOLEAN DEFAULT FALSE,
        isActive BOOLEAN DEFAULT TRUE,
        openedAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        deletedAt INTEGER,
        FOREIGN KEY (snapshotId) REFERENCES snapshots(id)
      );

      -- 用户配置表
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      -- 创建索引（per-window 默认策略）
      CREATE INDEX IF NOT EXISTS idx_current_tabs_per_window ON current_tabs(windowId, url);
      CREATE INDEX IF NOT EXISTS idx_snapshot_tabs_per_window ON snapshot_tabs(snapshotId, windowId, url);
    `);
  }

  // CurrentSession 操作
  async getCurrentSession(): Promise<any> {
    if (!this.db) return null;

    const session = this.db.prepare('SELECT * FROM current_session WHERE id = ?').get('singleton');
    if (!session) return null;

    const windows = this.db.prepare('SELECT * FROM current_windows').all();
    const tabs = this.db.prepare('SELECT * FROM current_tabs WHERE deletedAt IS NULL').all();

    return { ...session, windows, tabs };
  }

  async saveCurrentSession(session: any): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(() => {
      // 保存会话元信息
      this.db!.prepare(`
        INSERT OR REPLACE INTO current_session (id, updatedAt, windowCount, tabCount)
        VALUES (?, ?, ?, ?)
      `).run('singleton', session.updatedAt, session.windows.length, session.tabs.length);

      // 保存窗口
      this.db!.prepare('DELETE FROM current_windows').run();
      for (const win of session.windows) {
        this.db!.prepare(`
          INSERT INTO current_windows (id, windowId, windowType, isFocused, snapIndex)
          VALUES (?, ?, ?, ?, ?)
        `).run(win.windowId, win.windowId, win.windowType, win.isFocused ? 1 : 0, win.snapIndex);
      }

      // 保存标签页
      this.db!.prepare('DELETE FROM current_tabs').run();
      for (const tab of session.tabs) {
        this.db!.prepare(`
          INSERT INTO current_tabs (id, url, windowId, title, tabIndex, isPinned, openedAt, updatedAt, deletedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `${tab.windowId}-${tab.url}-${tab.openedAt}`,
          tab.url,
          tab.windowId,
          tab.title,
          tab.tabIndex,
          tab.isPinned ? 1 : 0,
          tab.openedAt,
          tab.updatedAt,
          tab.deletedAt || null
        );
      }
    });

    transaction();
  }

  // Snapshots 操作
  async getSnapshots(limit: number = 20): Promise<any[]> {
    if (!this.db) return [];
    return this.db.prepare(`
      SELECT id, createdAt, windowCount, tabCount, summary
      FROM snapshots
      ORDER BY createdAt DESC
      LIMIT ?
    `).all(limit);
  }

  async getSnapshotDetail(id: string): Promise<any> {
    if (!this.db) return null;

    const snapshot = this.db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id);
    if (!snapshot) return null;

    const windows = this.db.prepare('SELECT * FROM snapshot_windows WHERE snapshotId = ?').all(id);
    const tabs = this.db.prepare('SELECT * FROM snapshot_tabs WHERE snapshotId = ? AND deletedAt IS NULL').all(id);

    return { ...snapshot, windows, tabs };
  }

  async saveSnapshot(snapshot: any): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(() => {
      // 保存快照元信息
      this.db!.prepare(`
        INSERT INTO snapshots (id, createdAt, windowCount, tabCount, summary)
        VALUES (?, ?, ?, ?, ?)
      `).run(snapshot.id, snapshot.createdAt, snapshot.windowCount, snapshot.tabCount, JSON.stringify(snapshot.summary));

      // 保存窗口
      for (const win of snapshot.windows) {
        this.db!.prepare(`
          INSERT INTO snapshot_windows (id, snapshotId, windowId, windowType, isFocused, snapIndex)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(`${snapshot.id}-${win.windowId}`, snapshot.id, win.windowId, win.windowType, win.isFocused ? 1 : 0, win.snapIndex);
      }

      // 保存标签页
      for (const tab of snapshot.tabs) {
        const uniqueId = `${snapshot.id}-${tab.windowId}-${tab.url}-${tab.openedAt}`;
        this.db!.prepare(`
          INSERT INTO snapshot_tabs (id, snapshotId, windowId, url, title, tabIndex, isPinned, openedAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          uniqueId,
          snapshot.id,
          tab.windowId,
          tab.url,
          tab.title,
          tab.tabIndex,
          tab.isPinned ? 1 : 0,
          tab.openedAt,
          tab.updatedAt
        );
      }
    });

    transaction();
  }

  async deleteSnapshot(id: string): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(() => {
      this.db!.prepare('DELETE FROM snapshot_tabs WHERE snapshotId = ?').run(id);
      this.db!.prepare('DELETE FROM snapshot_windows WHERE snapshotId = ?').run(id);
      this.db!.prepare('DELETE FROM snapshots WHERE id = ?').run(id);
    });

    transaction();
  }

  // Settings 操作
  async getSettings(): Promise<any> {
    if (!this.db) return this.getDefaultSettings();

    const rows = this.db.prepare('SELECT * FROM settings').all() as any[];
    const settings: any = {};

    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }

    return { ...this.getDefaultSettings(), ...settings };
  }

  async saveSettings(settings: any): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        this.db!.prepare(`
          INSERT OR REPLACE INTO settings (key, value)
          VALUES (?, ?)
        `).run(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    });

    transaction();
  }

  async cleanupDeletedTabs(retentionDays: number): Promise<void> {
    if (!this.db) return;

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    this.db.prepare('DELETE FROM current_tabs WHERE deletedAt IS NOT NULL AND deletedAt < ?').run(cutoff);
    this.db.prepare('DELETE FROM snapshot_tabs WHERE deletedAt IS NOT NULL AND deletedAt < ?').run(cutoff);
  }

  private getDefaultSettings(): any {
    return {
      dedup: { strategy: 'per-window' },
      storage: { level: 2 },
      snapshot: { maxSnapshots: 20, autoSaveInterval: 5 },
      cleanup: { deletedRetentionDays: 30, autoCleanupEnabled: true },
      ui: { showRecoveryPromptOnStartup: false },
    };
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}

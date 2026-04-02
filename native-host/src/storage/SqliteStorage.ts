import DatabaseLib from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { getUrlId, normalizeUrlKey } from './urlIdentity.js';

type Database = DatabaseLib.Database;

/**
 * SQLite 存储管理器
 * 使用 better-sqlite3 进行本地存储
 */
export class SqliteStorage {
  private db: Database | null = null;
  private dbPath: string;
  private readonly browserScope: string;

  constructor(dbPath?: string, browserScope: string = 'unknown') {
    this.browserScope = this.normalizeBrowserScope(browserScope);
    this.dbPath = dbPath || join(homedir(), '.tabrescue', 'data.db');
  }

  private normalizeBrowserScope(browserScope: string): string {
    const normalized = browserScope.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return normalized || 'unknown';
  }

  async initialize(): Promise<void> {
    const dir = join(this.dbPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const Database = (await import('better-sqlite3')).default;
    this.db = new Database(this.dbPath) as unknown as Database;
    this.db.pragma('journal_mode = WAL');
    this.createTables();
  }

  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS urls (
        id TEXT PRIMARY KEY,
        urlKey TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        firstSeenAt INTEGER NOT NULL,
        lastSeenAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS current_session (
        browserScope TEXT NOT NULL,
        id TEXT NOT NULL CHECK (id = 'singleton'),
        updatedAt INTEGER NOT NULL,
        windowCount INTEGER NOT NULL,
        tabCount INTEGER NOT NULL,
        PRIMARY KEY (browserScope, id)
      );

      CREATE TABLE IF NOT EXISTS current_windows (
        browserScope TEXT NOT NULL,
        id TEXT NOT NULL,
        windowId TEXT NOT NULL,
        windowType TEXT,
        isFocused BOOLEAN DEFAULT FALSE,
        snapIndex INTEGER,
        PRIMARY KEY (browserScope, id),
        UNIQUE (browserScope, windowId)
      );

      CREATE TABLE IF NOT EXISTS current_tabs (
        browserScope TEXT NOT NULL,
        id TEXT NOT NULL,
        urlId TEXT NOT NULL,
        windowId TEXT NOT NULL,
        title TEXT,
        tabIndex INTEGER NOT NULL,
        isPinned BOOLEAN DEFAULT FALSE,
        openedAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        deletedAt INTEGER,
        PRIMARY KEY (browserScope, id),
        FOREIGN KEY (urlId) REFERENCES urls(id)
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        browserScope TEXT NOT NULL,
        id TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        windowCount INTEGER NOT NULL,
        tabCount INTEGER NOT NULL,
        summary TEXT,
        PRIMARY KEY (browserScope, id)
      );

      CREATE TABLE IF NOT EXISTS snapshot_windows (
        browserScope TEXT NOT NULL,
        id TEXT NOT NULL,
        snapshotId TEXT NOT NULL,
        windowId TEXT NOT NULL,
        windowType TEXT,
        isFocused BOOLEAN DEFAULT FALSE,
        snapIndex INTEGER,
        PRIMARY KEY (browserScope, id),
        FOREIGN KEY (browserScope, snapshotId) REFERENCES snapshots(browserScope, id)
      );

      CREATE TABLE IF NOT EXISTS snapshot_tabs (
        browserScope TEXT NOT NULL,
        id TEXT NOT NULL,
        snapshotId TEXT NOT NULL,
        urlId TEXT NOT NULL,
        windowId TEXT NOT NULL,
        title TEXT,
        tabIndex INTEGER NOT NULL,
        isPinned BOOLEAN DEFAULT FALSE,
        isActive BOOLEAN DEFAULT TRUE,
        openedAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        deletedAt INTEGER,
        PRIMARY KEY (browserScope, id),
        FOREIGN KEY (browserScope, snapshotId) REFERENCES snapshots(browserScope, id),
        FOREIGN KEY (urlId) REFERENCES urls(id)
      );

      CREATE TABLE IF NOT EXISTS settings (
        browserScope TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        PRIMARY KEY (browserScope, key)
      );

      CREATE INDEX IF NOT EXISTS idx_current_tabs_scope_window ON current_tabs(browserScope, windowId, tabIndex);
      CREATE INDEX IF NOT EXISTS idx_snapshot_tabs_scope_window ON snapshot_tabs(browserScope, snapshotId, windowId, tabIndex);
      CREATE INDEX IF NOT EXISTS idx_urls_key ON urls(urlKey);
    `);
  }

  private upsertUrl(rawUrl: string, seenAt: number): string {
    if (!this.db) {
      throw new Error('SQLite database not initialized');
    }

    const urlKey = normalizeUrlKey(rawUrl);
    const urlId = getUrlId(urlKey);

    this.db.prepare(`
      INSERT INTO urls (id, urlKey, url, firstSeenAt, lastSeenAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        lastSeenAt = excluded.lastSeenAt
    `).run(urlId, urlKey, urlKey, seenAt, seenAt);

    return urlId;
  }

  async getCurrentSession(): Promise<any> {
    if (!this.db) return null;

    const session = this.db.prepare(`
      SELECT id, updatedAt, windowCount, tabCount
      FROM current_session
      WHERE browserScope = ? AND id = ?
    `).get(this.browserScope, 'singleton') as any;
    if (!session) return null;

    const windows = this.db.prepare(`
      SELECT windowId, windowType, isFocused, snapIndex
      FROM current_windows
      WHERE browserScope = ?
      ORDER BY snapIndex ASC
    `).all(this.browserScope);

    const tabs = this.db.prepare(`
      SELECT
        current_tabs.id,
        urls.url,
        current_tabs.windowId,
        current_tabs.title,
        current_tabs.tabIndex,
        current_tabs.isPinned,
        current_tabs.openedAt,
        current_tabs.updatedAt,
        current_tabs.deletedAt
      FROM current_tabs
      JOIN urls ON urls.id = current_tabs.urlId
      WHERE current_tabs.browserScope = ? AND current_tabs.deletedAt IS NULL
      ORDER BY current_tabs.windowId ASC, current_tabs.tabIndex ASC
    `).all(this.browserScope);

    return { ...session, windows, tabs };
  }

  async saveCurrentSession(session: any): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(() => {
      this.db!.prepare(`
        INSERT OR REPLACE INTO current_session (browserScope, id, updatedAt, windowCount, tabCount)
        VALUES (?, ?, ?, ?, ?)
      `).run(this.browserScope, 'singleton', session.updatedAt, session.windows.length, session.tabs.length);

      this.db!.prepare('DELETE FROM current_windows WHERE browserScope = ?').run(this.browserScope);
      for (const win of session.windows) {
        this.db!.prepare(`
          INSERT INTO current_windows (browserScope, id, windowId, windowType, isFocused, snapIndex)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          this.browserScope,
          `${this.browserScope}:${win.windowId}`,
          win.windowId,
          win.windowType,
          win.isFocused ? 1 : 0,
          win.snapIndex
        );
      }

      this.db!.prepare('DELETE FROM current_tabs WHERE browserScope = ?').run(this.browserScope);
      for (let index = 0; index < session.tabs.length; index += 1) {
        const tab = session.tabs[index];
        const urlId = this.upsertUrl(tab.url, tab.updatedAt ?? session.updatedAt);

        this.db!.prepare(`
          INSERT INTO current_tabs (
            browserScope, id, urlId, windowId, title, tabIndex, isPinned, openedAt, updatedAt, deletedAt
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          this.browserScope,
          `${this.browserScope}:${tab.windowId}:${tab.openedAt}:${index}`,
          urlId,
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

  async getSnapshots(limit: number = 20): Promise<any[]> {
    if (!this.db) return [];
    return this.db.prepare(`
      SELECT id, createdAt, windowCount, tabCount, summary
      FROM snapshots
      WHERE browserScope = ?
      ORDER BY createdAt DESC
      LIMIT ?
    `).all(this.browserScope, limit);
  }

  async getSnapshotDetail(id: string): Promise<any> {
    if (!this.db) return null;

    const snapshot = this.db.prepare(`
      SELECT id, createdAt, windowCount, tabCount, summary
      FROM snapshots
      WHERE browserScope = ? AND id = ?
    `).get(this.browserScope, id);
    if (!snapshot) return null;

    const windows = this.db.prepare(`
      SELECT windowId, windowType, isFocused, snapIndex
      FROM snapshot_windows
      WHERE browserScope = ? AND snapshotId = ?
      ORDER BY snapIndex ASC
    `).all(this.browserScope, id);

    const tabs = this.db.prepare(`
      SELECT
        snapshot_tabs.id,
        urls.url,
        snapshot_tabs.windowId,
        snapshot_tabs.title,
        snapshot_tabs.tabIndex,
        snapshot_tabs.isPinned,
        snapshot_tabs.openedAt,
        snapshot_tabs.updatedAt,
        snapshot_tabs.deletedAt
      FROM snapshot_tabs
      JOIN urls ON urls.id = snapshot_tabs.urlId
      WHERE snapshot_tabs.browserScope = ? AND snapshot_tabs.snapshotId = ? AND snapshot_tabs.deletedAt IS NULL
      ORDER BY snapshot_tabs.windowId ASC, snapshot_tabs.tabIndex ASC
    `).all(this.browserScope, id);

    return { ...snapshot, windows, tabs };
  }

  async saveSnapshot(snapshot: any): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(() => {
      this.db!.prepare(`
        INSERT INTO snapshots (browserScope, id, createdAt, windowCount, tabCount, summary)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        this.browserScope,
        snapshot.id,
        snapshot.createdAt,
        snapshot.windowCount,
        snapshot.tabCount,
        JSON.stringify(snapshot.summary)
      );

      for (const win of snapshot.windows) {
        this.db!.prepare(`
          INSERT INTO snapshot_windows (browserScope, id, snapshotId, windowId, windowType, isFocused, snapIndex)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          this.browserScope,
          `${this.browserScope}:${snapshot.id}:${win.windowId}`,
          snapshot.id,
          win.windowId,
          win.windowType,
          win.isFocused ? 1 : 0,
          win.snapIndex
        );
      }

      for (let index = 0; index < snapshot.tabs.length; index += 1) {
        const tab = snapshot.tabs[index];
        const urlId = this.upsertUrl(tab.url, tab.updatedAt ?? snapshot.createdAt);

        this.db!.prepare(`
          INSERT INTO snapshot_tabs (
            browserScope, id, snapshotId, urlId, windowId, title, tabIndex, isPinned, openedAt, updatedAt, deletedAt
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          this.browserScope,
          `${this.browserScope}:${snapshot.id}:${tab.windowId}:${tab.openedAt}:${index}`,
          snapshot.id,
          urlId,
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

  async deleteSnapshot(id: string): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(() => {
      this.db!.prepare('DELETE FROM snapshot_tabs WHERE browserScope = ? AND snapshotId = ?').run(this.browserScope, id);
      this.db!.prepare('DELETE FROM snapshot_windows WHERE browserScope = ? AND snapshotId = ?').run(this.browserScope, id);
      this.db!.prepare('DELETE FROM snapshots WHERE browserScope = ? AND id = ?').run(this.browserScope, id);
    });

    transaction();
  }

  async getSettings(): Promise<any> {
    if (!this.db) return this.getDefaultSettings();

    const rows = this.db.prepare(`
      SELECT key, value
      FROM settings
      WHERE browserScope = ?
    `).all(this.browserScope) as any[];
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
          INSERT OR REPLACE INTO settings (browserScope, key, value)
          VALUES (?, ?, ?)
        `).run(this.browserScope, key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    });

    transaction();
  }

  async cleanupDeletedTabs(retentionDays: number): Promise<void> {
    if (!this.db) return;

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    this.db.prepare('DELETE FROM snapshot_tabs WHERE browserScope = ? AND deletedAt IS NOT NULL AND deletedAt < ?').run(this.browserScope, cutoff);
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

import { Pool, QueryResult } from 'pg';

/**
 * PostgreSQL 存储管理器
 */
export class PostgresStorage {
  private pool: Pool | null = null;
  private config: any;

  constructor(config: any) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const { Pool } = await import('pg');
    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
    });

    await this.createTables();
  }

  private async createTables(): Promise<void> {
    if (!this.pool) return;

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS current_session (
        id TEXT PRIMARY KEY CHECK (id = 'singleton'),
        updatedAt BIGINT NOT NULL,
        windowCount INTEGER NOT NULL,
        tabCount INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS current_windows (
        id TEXT PRIMARY KEY,
        windowId TEXT NOT NULL UNIQUE,
        windowType TEXT,
        isFocused BOOLEAN DEFAULT FALSE,
        snapIndex INTEGER
      );

      CREATE TABLE IF NOT EXISTS current_tabs (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        windowId TEXT NOT NULL,
        title TEXT,
        tabIndex INTEGER NOT NULL,
        isPinned BOOLEAN DEFAULT FALSE,
        openedAt BIGINT NOT NULL,
        updatedAt BIGINT NOT NULL,
        deletedAt BIGINT
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        createdAt BIGINT NOT NULL,
        windowCount INTEGER NOT NULL,
        tabCount INTEGER NOT NULL,
        summary JSONB
      );

      CREATE TABLE IF NOT EXISTS snapshot_windows (
        id TEXT PRIMARY KEY,
        snapshotId TEXT NOT NULL REFERENCES snapshots(id),
        windowId TEXT NOT NULL,
        windowType TEXT,
        isFocused BOOLEAN DEFAULT FALSE,
        snapIndex INTEGER
      );

      CREATE TABLE IF NOT EXISTS snapshot_tabs (
        id TEXT PRIMARY KEY,
        snapshotId TEXT NOT NULL REFERENCES snapshots(id),
        windowId TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT,
        tabIndex INTEGER NOT NULL,
        isPinned BOOLEAN DEFAULT FALSE,
        isActive BOOLEAN DEFAULT TRUE,
        openedAt BIGINT NOT NULL,
        updatedAt BIGINT NOT NULL,
        deletedAt BIGINT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value JSONB
      );

      CREATE INDEX IF NOT EXISTS idx_current_tabs_per_window ON current_tabs(windowId, url);
      CREATE INDEX IF NOT EXISTS idx_snapshot_tabs_per_window ON snapshot_tabs(snapshotId, windowId, url);
    `);
  }

  async getCurrentSession(): Promise<any> {
    if (!this.pool) return null;

    const sessionResult = await this.pool.query('SELECT * FROM current_session WHERE id = $1', ['singleton']);
    if (sessionResult.rows.length === 0) return null;

    const windowsResult = await this.pool.query('SELECT * FROM current_windows');
    const tabsResult = await this.pool.query('SELECT * FROM current_tabs WHERE deletedAt IS NULL');

    return {
      ...sessionResult.rows[0],
      windows: windowsResult.rows,
      tabs: tabsResult.rows,
    };
  }

  async saveCurrentSession(session: any): Promise<void> {
    if (!this.pool) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        INSERT INTO current_session (id, updatedAt, windowCount, tabCount)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          updatedAt = $2,
          windowCount = $3,
          tabCount = $4
      `, ['singleton', session.updatedAt, session.windows.length, session.tabs.length]);

      await client.query('DELETE FROM current_windows');
      for (const win of session.windows) {
        await client.query(`
          INSERT INTO current_windows (id, windowId, windowType, isFocused, snapIndex)
          VALUES ($1, $2, $3, $4, $5)
        `, [win.windowId, win.windowId, win.windowType, win.isFocused, win.snapIndex]);
      }

      await client.query('DELETE FROM current_tabs');
      for (const tab of session.tabs) {
        await client.query(`
          INSERT INTO current_tabs (id, url, windowId, title, tabIndex, isPinned, openedAt, updatedAt, deletedAt)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          `${tab.windowId}-${tab.url}-${tab.openedAt}`,
          tab.url,
          tab.windowId,
          tab.title,
          tab.tabIndex,
          tab.isPinned,
          tab.openedAt,
          tab.updatedAt,
          tab.deletedAt || null,
        ]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getSnapshots(limit: number = 20): Promise<any[]> {
    if (!this.pool) return [];

    const result = await this.pool.query(`
      SELECT id, createdAt, windowCount, tabCount, summary
      FROM snapshots
      ORDER BY createdAt DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  async getSnapshotDetail(id: string): Promise<any> {
    if (!this.pool) return null;

    const snapshotResult = await this.pool.query('SELECT * FROM snapshots WHERE id = $1', [id]);
    if (snapshotResult.rows.length === 0) return null;

    const windowsResult = await this.pool.query('SELECT * FROM snapshot_windows WHERE snapshotId = $1', [id]);
    const tabsResult = await this.pool.query('SELECT * FROM snapshot_tabs WHERE snapshotId = $1 AND deletedAt IS NULL', [id]);

    return {
      ...snapshotResult.rows[0],
      windows: windowsResult.rows,
      tabs: tabsResult.rows,
    };
  }

  async saveSnapshot(snapshot: any): Promise<void> {
    if (!this.pool) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        INSERT INTO snapshots (id, createdAt, windowCount, tabCount, summary)
        VALUES ($1, $2, $3, $4, $5)
      `, [snapshot.id, snapshot.createdAt, snapshot.windowCount, snapshot.tabCount, JSON.stringify(snapshot.summary)]);

      for (const win of snapshot.windows) {
        await client.query(`
          INSERT INTO snapshot_windows (id, snapshotId, windowId, windowType, isFocused, snapIndex)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [`${snapshot.id}-${win.windowId}`, snapshot.id, win.windowId, win.windowType, win.isFocused, win.snapIndex]);
      }

      for (const tab of snapshot.tabs) {
        const uniqueId = `${snapshot.id}-${tab.windowId}-${tab.url}-${tab.openedAt}`;
        await client.query(`
          INSERT INTO snapshot_tabs (id, snapshotId, windowId, url, title, tabIndex, isPinned, openedAt, updatedAt)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          uniqueId,
          snapshot.id,
          tab.windowId,
          tab.url,
          tab.title,
          tab.tabIndex,
          tab.isPinned,
          tab.openedAt,
          tab.updatedAt,
        ]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteSnapshot(id: string): Promise<void> {
    if (!this.pool) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM snapshot_tabs WHERE snapshotId = $1', [id]);
      await client.query('DELETE FROM snapshot_windows WHERE snapshotId = $1', [id]);
      await client.query('DELETE FROM snapshots WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getSettings(): Promise<any> {
    if (!this.pool) return this.getDefaultSettings();

    const result = await this.pool.query('SELECT * FROM settings');
    const settings: any = {};

    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    return { ...this.getDefaultSettings(), ...settings };
  }

  async saveSettings(settings: any): Promise<void> {
    if (!this.pool) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of Object.entries(settings)) {
        await client.query(`
          INSERT INTO settings (key, value)
          VALUES ($1, $2)
          ON CONFLICT (key) DO UPDATE SET value = $2
        `, [key, value]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async cleanupDeletedTabs(retentionDays: number): Promise<void> {
    if (!this.pool) return;

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    await this.pool.query('DELETE FROM current_tabs WHERE deletedAt IS NOT NULL AND deletedAt < $1', [cutoff]);
    await this.pool.query('DELETE FROM snapshot_tabs WHERE deletedAt IS NOT NULL AND deletedAt < $1', [cutoff]);
  }

  private getDefaultSettings(): any {
    return {
      dedup: { strategy: 'per-window' },
      storage: { level: 3 },
      snapshot: { maxSnapshots: 20, autoSaveInterval: 5 },
      cleanup: { deletedRetentionDays: 30, autoCleanupEnabled: true },
      ui: { showRecoveryPromptOnStartup: false },
    };
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

import { createPool } from 'mysql2/promise';
import { Pool } from 'mysql2/promise';

/**
 * MySQL 存储管理器
 */
export class MysqlStorage {
  private pool: Pool | null = null;
  private config: any;

  constructor(config: any) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.pool = createPool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
      multipleStatements: true,
    });

    await this.createTables();
  }

  private async createTables(): Promise<void> {
    if (!this.pool) return;

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS current_session (
        id VARCHAR(255) PRIMARY KEY CHECK (id = 'singleton'),
        updatedAt BIGINT NOT NULL,
        windowCount INT NOT NULL,
        tabCount INT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS current_windows (
        id VARCHAR(255) PRIMARY KEY,
        windowId VARCHAR(255) NOT NULL UNIQUE,
        windowType VARCHAR(50),
        isFocused BOOLEAN DEFAULT FALSE,
        snapIndex INT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS current_tabs (
        id VARCHAR(255) PRIMARY KEY,
        url TEXT NOT NULL,
        windowId VARCHAR(255) NOT NULL,
        title TEXT,
        tabIndex INT NOT NULL,
        isPinned BOOLEAN DEFAULT FALSE,
        openedAt BIGINT NOT NULL,
        updatedAt BIGINT NOT NULL,
        deletedAt BIGINT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS snapshots (
        id VARCHAR(255) PRIMARY KEY,
        createdAt BIGINT NOT NULL,
        windowCount INT NOT NULL,
        tabCount INT NOT NULL,
        summary JSON
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS snapshot_windows (
        id VARCHAR(255) PRIMARY KEY,
        snapshotId VARCHAR(255) NOT NULL,
        windowId VARCHAR(255) NOT NULL,
        windowType VARCHAR(50),
        isFocused BOOLEAN DEFAULT FALSE,
        snapIndex INT,
        FOREIGN KEY (snapshotId) REFERENCES snapshots(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS snapshot_tabs (
        id VARCHAR(255) PRIMARY KEY,
        snapshotId VARCHAR(255) NOT NULL,
        windowId VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        title TEXT,
        tabIndex INT NOT NULL,
        isPinned BOOLEAN DEFAULT FALSE,
        isActive BOOLEAN DEFAULT TRUE,
        openedAt BIGINT NOT NULL,
        updatedAt BIGINT NOT NULL,
        deletedAt BIGINT,
        FOREIGN KEY (snapshotId) REFERENCES snapshots(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(255) PRIMARY KEY,
        value JSON
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE INDEX IF NOT EXISTS idx_current_tabs_per_window ON current_tabs(windowId(100), url(200));
      CREATE INDEX IF NOT EXISTS idx_snapshot_tabs_per_window ON snapshot_tabs(snapshotId, windowId(100), url(200));
    `);
  }

  async getCurrentSession(): Promise<any> {
    if (!this.pool) return null;

    const [sessionRows] = await this.pool.query('SELECT * FROM current_session WHERE id = ?', ['singleton']);
    if ((sessionRows as any[]).length === 0) return null;

    const [windowsRows] = await this.pool.query('SELECT * FROM current_windows');
    const [tabsRows] = await this.pool.query('SELECT * FROM current_tabs WHERE deletedAt IS NULL');

    return {
      ...(sessionRows as any[])[0],
      windows: windowsRows,
      tabs: tabsRows,
    };
  }

  async saveCurrentSession(session: any): Promise<void> {
    if (!this.pool) return;

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(`
        INSERT INTO current_session (id, updatedAt, windowCount, tabCount)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          updatedAt = VALUES(updatedAt),
          windowCount = VALUES(windowCount),
          tabCount = VALUES(tabCount)
      `, ['singleton', session.updatedAt, session.windows.length, session.tabs.length]);

      await connection.query('DELETE FROM current_windows');
      for (const win of session.windows) {
        await connection.query(`
          INSERT INTO current_windows (id, windowId, windowType, isFocused, snapIndex)
          VALUES (?, ?, ?, ?, ?)
        `, [win.windowId, win.windowId, win.windowType, win.isFocused, win.snapIndex]);
      }

      await connection.query('DELETE FROM current_tabs');
      for (const tab of session.tabs) {
        await connection.query(`
          INSERT INTO current_tabs (id, url, windowId, title, tabIndex, isPinned, openedAt, updatedAt, deletedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async getSnapshots(limit: number = 20): Promise<any[]> {
    if (!this.pool) return [];

    const [rows] = await this.pool.query(`
      SELECT id, createdAt, windowCount, tabCount, summary
      FROM snapshots
      ORDER BY createdAt DESC
      LIMIT ?
    `, [limit]);

    return rows as any[];
  }

  async getSnapshotDetail(id: string): Promise<any> {
    if (!this.pool) return null;

    const [snapshotRows] = await this.pool.query('SELECT * FROM snapshots WHERE id = ?', [id]);
    if ((snapshotRows as any[]).length === 0) return null;

    const [windowsRows] = await this.pool.query('SELECT * FROM snapshot_windows WHERE snapshotId = ?', [id]);
    const [tabsRows] = await this.pool.query('SELECT * FROM snapshot_tabs WHERE snapshotId = ? AND deletedAt IS NULL', [id]);

    return {
      ...(snapshotRows as any[])[0],
      windows: windowsRows,
      tabs: tabsRows,
    };
  }

  async saveSnapshot(snapshot: any): Promise<void> {
    if (!this.pool) return;

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(`
        INSERT INTO snapshots (id, createdAt, windowCount, tabCount, summary)
        VALUES (?, ?, ?, ?, ?)
      `, [snapshot.id, snapshot.createdAt, snapshot.windowCount, snapshot.tabCount, JSON.stringify(snapshot.summary)]);

      for (const win of snapshot.windows) {
        await connection.query(`
          INSERT INTO snapshot_windows (id, snapshotId, windowId, windowType, isFocused, snapIndex)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [`${snapshot.id}-${win.windowId}`, snapshot.id, win.windowId, win.windowType, win.isFocused, win.snapIndex]);
      }

      for (const tab of snapshot.tabs) {
        const uniqueId = `${snapshot.id}-${tab.windowId}-${tab.url}-${tab.openedAt}`;
        await connection.query(`
          INSERT INTO snapshot_tabs (id, snapshotId, windowId, url, title, tabIndex, isPinned, openedAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async deleteSnapshot(id: string): Promise<void> {
    if (!this.pool) return;

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM snapshot_tabs WHERE snapshotId = ?', [id]);
      await connection.query('DELETE FROM snapshot_windows WHERE snapshotId = ?', [id]);
      await connection.query('DELETE FROM snapshots WHERE id = ?', [id]);
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async getSettings(): Promise<any> {
    if (!this.pool) return this.getDefaultSettings();

    const [rows] = await this.pool.query('SELECT * FROM settings');
    const settings: any = {};

    for (const row of rows as any[]) {
      settings[row.key] = row.value;
    }

    return { ...this.getDefaultSettings(), ...settings };
  }

  async saveSettings(settings: any): Promise<void> {
    if (!this.pool) return;

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const [key, value] of Object.entries(settings)) {
        await connection.query(`
          INSERT INTO settings (key, value)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE value = VALUES(value)
        `, [key, JSON.stringify(value)]);
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async cleanupDeletedTabs(retentionDays: number): Promise<void> {
    if (!this.pool) return;

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    await this.pool.query('DELETE FROM current_tabs WHERE deletedAt IS NOT NULL AND deletedAt < ?', [cutoff]);
    await this.pool.query('DELETE FROM snapshot_tabs WHERE deletedAt IS NOT NULL AND deletedAt < ?', [cutoff]);
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

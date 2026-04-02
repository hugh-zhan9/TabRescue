import { createPool } from 'mysql2/promise';
import { Pool } from 'mysql2/promise';
import { getUrlId, normalizeUrlKey } from './urlIdentity.js';

/**
 * MySQL 存储管理器
 */
export class MysqlStorage {
  private pool: Pool | null = null;
  private config: any;
  private readonly browserScope: string;

  constructor(config: any, browserScope: string = 'unknown') {
    this.config = config;
    this.browserScope = this.normalizeBrowserScope(browserScope);
  }

  private normalizeBrowserScope(browserScope: string): string {
    const normalized = browserScope.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return normalized || 'unknown';
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number') {
      return value;
    }
    return Number(value ?? 0);
  }

  private normalizeWindow(row: any) {
    return {
      windowId: row.windowId ?? row.windowid,
      windowType: row.windowType ?? row.windowtype,
      isFocused: row.isFocused ?? row.isfocused ?? false,
      snapIndex: this.toNumber(row.snapIndex ?? row.snapindex),
    };
  }

  private normalizeTab(row: any) {
    return {
      id: row.id,
      url: row.url,
      windowId: row.windowId ?? row.windowid,
      title: row.title,
      tabIndex: this.toNumber(row.tabIndex ?? row.tabindex),
      isPinned: row.isPinned ?? row.ispinned ?? false,
      openedAt: this.toNumber(row.openedAt ?? row.openedat),
      updatedAt: this.toNumber(row.updatedAt ?? row.updatedat),
      deletedAt: row.deletedAt ?? row.deletedat ?? null,
    };
  }

  private normalizeSnapshot(row: any) {
    return {
      id: row.id,
      createdAt: this.toNumber(row.createdAt ?? row.createdat),
      windowCount: this.toNumber(row.windowCount ?? row.windowcount),
      tabCount: this.toNumber(row.tabCount ?? row.tabcount),
      summary: row.summary,
    };
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
      CREATE TABLE IF NOT EXISTS urls (
        id VARCHAR(255) PRIMARY KEY,
        urlKey TEXT NOT NULL,
        url TEXT NOT NULL,
        firstSeenAt BIGINT NOT NULL,
        lastSeenAt BIGINT NOT NULL,
        UNIQUE KEY uniq_urls_key (urlKey(255))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS current_session (
        browserScope VARCHAR(32) NOT NULL,
        id VARCHAR(64) NOT NULL,
        updatedAt BIGINT NOT NULL,
        windowCount INT NOT NULL,
        tabCount INT NOT NULL,
        PRIMARY KEY (browserScope, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS current_windows (
        browserScope VARCHAR(32) NOT NULL,
        id VARCHAR(255) NOT NULL,
        windowId VARCHAR(255) NOT NULL,
        windowType VARCHAR(50),
        isFocused BOOLEAN DEFAULT FALSE,
        snapIndex INT,
        PRIMARY KEY (browserScope, id),
        UNIQUE KEY uniq_current_windows_scope_window (browserScope, windowId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS current_tabs (
        browserScope VARCHAR(32) NOT NULL,
        id VARCHAR(255) NOT NULL,
        urlId VARCHAR(255) NOT NULL,
        windowId VARCHAR(255) NOT NULL,
        title TEXT,
        tabIndex INT NOT NULL,
        isPinned BOOLEAN DEFAULT FALSE,
        openedAt BIGINT NOT NULL,
        updatedAt BIGINT NOT NULL,
        deletedAt BIGINT,
        PRIMARY KEY (browserScope, id),
        KEY idx_current_tabs_scope_window (browserScope, windowId, tabIndex),
        CONSTRAINT fk_current_tabs_url FOREIGN KEY (urlId) REFERENCES urls(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS snapshots (
        browserScope VARCHAR(32) NOT NULL,
        id VARCHAR(255) NOT NULL,
        createdAt BIGINT NOT NULL,
        windowCount INT NOT NULL,
        tabCount INT NOT NULL,
        summary JSON,
        PRIMARY KEY (browserScope, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS snapshot_windows (
        browserScope VARCHAR(32) NOT NULL,
        id VARCHAR(255) NOT NULL,
        snapshotId VARCHAR(255) NOT NULL,
        windowId VARCHAR(255) NOT NULL,
        windowType VARCHAR(50),
        isFocused BOOLEAN DEFAULT FALSE,
        snapIndex INT,
        PRIMARY KEY (browserScope, id),
        CONSTRAINT fk_snapshot_windows_snapshot FOREIGN KEY (browserScope, snapshotId)
          REFERENCES snapshots(browserScope, id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS snapshot_tabs (
        browserScope VARCHAR(32) NOT NULL,
        id VARCHAR(255) NOT NULL,
        snapshotId VARCHAR(255) NOT NULL,
        urlId VARCHAR(255) NOT NULL,
        windowId VARCHAR(255) NOT NULL,
        title TEXT,
        tabIndex INT NOT NULL,
        isPinned BOOLEAN DEFAULT FALSE,
        isActive BOOLEAN DEFAULT TRUE,
        openedAt BIGINT NOT NULL,
        updatedAt BIGINT NOT NULL,
        deletedAt BIGINT,
        PRIMARY KEY (browserScope, id),
        KEY idx_snapshot_tabs_scope_window (browserScope, snapshotId, windowId, tabIndex),
        CONSTRAINT fk_snapshot_tabs_snapshot FOREIGN KEY (browserScope, snapshotId)
          REFERENCES snapshots(browserScope, id) ON DELETE CASCADE,
        CONSTRAINT fk_snapshot_tabs_url FOREIGN KEY (urlId) REFERENCES urls(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS settings (
        browserScope VARCHAR(32) NOT NULL,
        \`key\` VARCHAR(255) NOT NULL,
        value JSON,
        PRIMARY KEY (browserScope, \`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  private async upsertUrl(connection: any, rawUrl: string, seenAt: number): Promise<string> {
    const urlKey = normalizeUrlKey(rawUrl);
    const urlId = getUrlId(urlKey);

    await connection.query(`
      INSERT INTO urls (id, urlKey, url, firstSeenAt, lastSeenAt)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        lastSeenAt = VALUES(lastSeenAt)
    `, [urlId, urlKey, urlKey, seenAt, seenAt]);

    return urlId;
  }

  async getCurrentSession(): Promise<any> {
    if (!this.pool) return null;

    const [sessionRows] = await this.pool.query(`
      SELECT id, updatedAt, windowCount, tabCount
      FROM current_session
      WHERE browserScope = ? AND id = ?
    `, [this.browserScope, 'singleton']);
    if ((sessionRows as any[]).length === 0) return null;

    const [windowsRows] = await this.pool.query(`
      SELECT windowId, windowType, isFocused, snapIndex
      FROM current_windows
      WHERE browserScope = ?
      ORDER BY snapIndex ASC
    `, [this.browserScope]);
    const [tabsRows] = await this.pool.query(`
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
    `, [this.browserScope]);

    return {
      id: (sessionRows as any[])[0].id,
      updatedAt: this.toNumber((sessionRows as any[])[0].updatedAt ?? (sessionRows as any[])[0].updatedat),
      windowCount: this.toNumber((sessionRows as any[])[0].windowCount ?? (sessionRows as any[])[0].windowcount),
      tabCount: this.toNumber((sessionRows as any[])[0].tabCount ?? (sessionRows as any[])[0].tabcount),
      windows: (windowsRows as any[]).map((row) => this.normalizeWindow(row)),
      tabs: (tabsRows as any[]).map((row) => this.normalizeTab(row)),
    };
  }

  async saveCurrentSession(session: any): Promise<void> {
    if (!this.pool) return;

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(`
        INSERT INTO current_session (browserScope, id, updatedAt, windowCount, tabCount)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          updatedAt = VALUES(updatedAt),
          windowCount = VALUES(windowCount),
          tabCount = VALUES(tabCount)
      `, [this.browserScope, 'singleton', session.updatedAt, session.windows.length, session.tabs.length]);

      await connection.query('DELETE FROM current_windows WHERE browserScope = ?', [this.browserScope]);
      for (const win of session.windows) {
        await connection.query(`
          INSERT INTO current_windows (browserScope, id, windowId, windowType, isFocused, snapIndex)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          this.browserScope,
          `${this.browserScope}:${win.windowId}`,
          win.windowId,
          win.windowType,
          win.isFocused,
          win.snapIndex,
        ]);
      }

      await connection.query('DELETE FROM current_tabs WHERE browserScope = ?', [this.browserScope]);
      for (let index = 0; index < session.tabs.length; index += 1) {
        const tab = session.tabs[index];
        const urlId = await this.upsertUrl(connection, tab.url, tab.updatedAt ?? session.updatedAt);

        await connection.query(`
          INSERT INTO current_tabs (
            browserScope, id, urlId, windowId, title, tabIndex, isPinned, openedAt, updatedAt, deletedAt
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          this.browserScope,
          `${this.browserScope}:${tab.windowId}:${tab.openedAt}:${index}`,
          urlId,
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
      WHERE browserScope = ?
      ORDER BY createdAt DESC
      LIMIT ?
    `, [this.browserScope, limit]);

    return (rows as any[]).map((row) => this.normalizeSnapshot(row));
  }

  async getSnapshotDetail(id: string): Promise<any> {
    if (!this.pool) return null;

    const [snapshotRows] = await this.pool.query(`
      SELECT id, createdAt, windowCount, tabCount, summary
      FROM snapshots
      WHERE browserScope = ? AND id = ?
    `, [this.browserScope, id]);
    if ((snapshotRows as any[]).length === 0) return null;

    const [windowsRows] = await this.pool.query(`
      SELECT windowId, windowType, isFocused, snapIndex
      FROM snapshot_windows
      WHERE browserScope = ? AND snapshotId = ?
      ORDER BY snapIndex ASC
    `, [this.browserScope, id]);
    const [tabsRows] = await this.pool.query(`
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
    `, [this.browserScope, id]);

    return {
      ...this.normalizeSnapshot((snapshotRows as any[])[0]),
      windows: (windowsRows as any[]).map((row) => this.normalizeWindow(row)),
      tabs: (tabsRows as any[]).map((row) => this.normalizeTab(row)),
    };
  }

  async saveSnapshot(snapshot: any): Promise<void> {
    if (!this.pool) return;

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(`
        INSERT INTO snapshots (browserScope, id, createdAt, windowCount, tabCount, summary)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        this.browserScope,
        snapshot.id,
        snapshot.createdAt,
        snapshot.windowCount,
        snapshot.tabCount,
        JSON.stringify(snapshot.summary),
      ]);

      for (const win of snapshot.windows) {
        await connection.query(`
          INSERT INTO snapshot_windows (browserScope, id, snapshotId, windowId, windowType, isFocused, snapIndex)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          this.browserScope,
          `${this.browserScope}:${snapshot.id}:${win.windowId}`,
          snapshot.id,
          win.windowId,
          win.windowType,
          win.isFocused,
          win.snapIndex,
        ]);
      }

      for (let index = 0; index < snapshot.tabs.length; index += 1) {
        const tab = snapshot.tabs[index];
        const urlId = await this.upsertUrl(connection, tab.url, tab.updatedAt ?? snapshot.createdAt);

        await connection.query(`
          INSERT INTO snapshot_tabs (
            browserScope, id, snapshotId, urlId, windowId, title, tabIndex, isPinned, openedAt, updatedAt, deletedAt
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          this.browserScope,
          `${this.browserScope}:${snapshot.id}:${tab.windowId}:${tab.openedAt}:${index}`,
          snapshot.id,
          urlId,
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

  async deleteSnapshot(id: string): Promise<void> {
    if (!this.pool) return;

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM snapshot_tabs WHERE browserScope = ? AND snapshotId = ?', [this.browserScope, id]);
      await connection.query('DELETE FROM snapshot_windows WHERE browserScope = ? AND snapshotId = ?', [this.browserScope, id]);
      await connection.query('DELETE FROM snapshots WHERE browserScope = ? AND id = ?', [this.browserScope, id]);
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

    const [rows] = await this.pool.query(`
      SELECT \`key\`, value
      FROM settings
      WHERE browserScope = ?
    `, [this.browserScope]);
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
          INSERT INTO settings (browserScope, \`key\`, value)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE value = VALUES(value)
        `, [this.browserScope, key, JSON.stringify(value)]);
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
    await this.pool.query('DELETE FROM snapshot_tabs WHERE browserScope = ? AND deletedAt IS NOT NULL AND deletedAt < ?', [this.browserScope, cutoff]);
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

import { Pool } from 'pg';
import { getUrlId, normalizeUrlKey } from './urlIdentity.js';

/**
 * PostgreSQL 存储管理器
 */
export class PostgresStorage {
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
    const { Pool } = await import('pg');
    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
    });

    await this.migrateLegacySchema();
    await this.createTables();
  }

  private async tableExists(tableName: string): Promise<boolean> {
    if (!this.pool) return false;

    const result = await this.pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS exists
    `, [tableName]);

    return Boolean(result.rows[0]?.exists);
  }

  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    if (!this.pool) return false;

    const result = await this.pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      ) AS exists
    `, [tableName, columnName.toLowerCase()]);

    return Boolean(result.rows[0]?.exists);
  }

  private async migrateLegacySchema(): Promise<void> {
    if (!this.pool) return;

    const hasCurrentSession = await this.tableExists('current_session');
    if (!hasCurrentSession) {
      return;
    }

    const hasBrowserScope = await this.columnExists('current_session', 'browserScope');
    const hasUrlId = await this.tableExists('current_tabs')
      ? await this.columnExists('current_tabs', 'urlId')
      : false;

    if (hasBrowserScope && hasUrlId) {
      return;
    }

    const legacyTables = [
      'current_session',
      'current_windows',
      'current_tabs',
      'snapshots',
      'snapshot_windows',
      'snapshot_tabs',
      'settings',
    ];

    await this.pool.query('BEGIN');
    try {
      for (const tableName of legacyTables) {
        const legacyName = `legacy_shared_${tableName}`;
        const exists = await this.tableExists(tableName);
        if (!exists) {
          continue;
        }

        const legacyExists = await this.tableExists(legacyName);
        if (!legacyExists) {
          await this.pool.query(`ALTER TABLE ${tableName} RENAME TO ${legacyName}`);
        }
      }

      await this.pool.query('COMMIT');
    } catch (error) {
      await this.pool.query('ROLLBACK');
      throw error;
    }

    await this.createTables();
    await this.importLegacySharedData();
  }

  private async importLegacySharedData(): Promise<void> {
    if (!this.pool) return;

    const hasLegacySession = await this.tableExists('legacy_shared_current_session');
    if (!hasLegacySession) {
      return;
    }

    const dataExistsResult = await this.pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM current_session WHERE browserScope = $1
      ) AS exists
    `, [this.browserScope]);
    if (dataExistsResult.rows[0]?.exists) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const sessionResult = await client.query(`
        SELECT id, updatedat, windowcount, tabcount
        FROM legacy_shared_current_session
        WHERE id = 'singleton'
      `);
      if (sessionResult.rows.length > 0) {
        const row = sessionResult.rows[0];
        await client.query(`
          INSERT INTO current_session (browserScope, id, updatedAt, windowCount, tabCount)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          this.browserScope,
          row.id,
          row.updatedat,
          row.windowcount,
          row.tabcount,
        ]);
      }

      const windowsResult = await client.query(`
        SELECT id, windowid, windowtype, isfocused, snapindex
        FROM legacy_shared_current_windows
      `);
      for (const row of windowsResult.rows) {
        await client.query(`
          INSERT INTO current_windows (browserScope, id, windowId, windowType, isFocused, snapIndex)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          this.browserScope,
          `${this.browserScope}:${row.windowid ?? row.id}`,
          row.windowid ?? row.id,
          row.windowtype,
          row.isfocused,
          row.snapindex,
        ]);
      }

      const currentTabsResult = await client.query(`
        SELECT id, url, windowid, title, tabindex, ispinned, openedat, updatedat, deletedat
        FROM legacy_shared_current_tabs
      `);
      for (let index = 0; index < currentTabsResult.rows.length; index += 1) {
        const row = currentTabsResult.rows[index];
        const urlId = await this.upsertUrl(client, row.url, row.updatedat ?? Date.now());
        await client.query(`
          INSERT INTO current_tabs (browserScope, id, urlId, windowId, title, tabIndex, isPinned, openedAt, updatedAt, deletedAt)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          this.browserScope,
          `${this.browserScope}:${row.windowid}:${row.openedat}:${index}`,
          urlId,
          row.windowid,
          row.title,
          row.tabindex,
          row.ispinned,
          row.openedat,
          row.updatedat,
          row.deletedat,
        ]);
      }

      const snapshotsResult = await client.query(`
        SELECT id, createdat, windowcount, tabcount, summary
        FROM legacy_shared_snapshots
      `);
      for (const row of snapshotsResult.rows) {
        await client.query(`
          INSERT INTO snapshots (browserScope, id, createdAt, windowCount, tabCount, summary)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          this.browserScope,
          row.id,
          row.createdat,
          row.windowcount,
          row.tabcount,
          row.summary,
        ]);
      }

      const snapshotWindowsResult = await client.query(`
        SELECT id, snapshotid, windowid, windowtype, isfocused, snapindex
        FROM legacy_shared_snapshot_windows
      `);
      for (const row of snapshotWindowsResult.rows) {
        await client.query(`
          INSERT INTO snapshot_windows (browserScope, id, snapshotId, windowId, windowType, isFocused, snapIndex)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          this.browserScope,
          `${this.browserScope}:${row.snapshotid}:${row.windowid}`,
          row.snapshotid,
          row.windowid,
          row.windowtype,
          row.isfocused,
          row.snapindex,
        ]);
      }

      const snapshotTabsResult = await client.query(`
        SELECT id, snapshotid, windowid, url, title, tabindex, ispinned, openedat, updatedat, deletedat
        FROM legacy_shared_snapshot_tabs
      `);
      for (let index = 0; index < snapshotTabsResult.rows.length; index += 1) {
        const row = snapshotTabsResult.rows[index];
        const urlId = await this.upsertUrl(client, row.url, row.updatedat ?? Date.now());
        await client.query(`
          INSERT INTO snapshot_tabs (
            browserScope, id, snapshotId, urlId, windowId, title, tabIndex, isPinned, openedAt, updatedAt, deletedAt
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          this.browserScope,
          `${this.browserScope}:${row.snapshotid}:${row.windowid}:${row.openedat}:${index}`,
          row.snapshotid,
          urlId,
          row.windowid,
          row.title,
          row.tabindex,
          row.ispinned,
          row.openedat,
          row.updatedat,
          row.deletedat,
        ]);
      }

      const settingsResult = await client.query(`
        SELECT key, value
        FROM legacy_shared_settings
      `);
      for (const row of settingsResult.rows) {
        await client.query(`
          INSERT INTO settings (browserScope, key, value)
          VALUES ($1, $2, $3)
          ON CONFLICT (browserScope, key) DO UPDATE SET value = $3
        `, [this.browserScope, row.key, row.value]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async createTables(): Promise<void> {
    if (!this.pool) return;

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS urls (
        id TEXT PRIMARY KEY,
        urlKey TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        firstSeenAt BIGINT NOT NULL,
        lastSeenAt BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS current_session (
        browserScope TEXT NOT NULL,
        id TEXT NOT NULL CHECK (id = 'singleton'),
        updatedAt BIGINT NOT NULL,
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
        urlId TEXT NOT NULL REFERENCES urls(id),
        windowId TEXT NOT NULL,
        title TEXT,
        tabIndex INTEGER NOT NULL,
        isPinned BOOLEAN DEFAULT FALSE,
        openedAt BIGINT NOT NULL,
        updatedAt BIGINT NOT NULL,
        deletedAt BIGINT,
        PRIMARY KEY (browserScope, id)
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        browserScope TEXT NOT NULL,
        id TEXT NOT NULL,
        createdAt BIGINT NOT NULL,
        windowCount INTEGER NOT NULL,
        tabCount INTEGER NOT NULL,
        summary JSONB,
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
        urlId TEXT NOT NULL REFERENCES urls(id),
        windowId TEXT NOT NULL,
        title TEXT,
        tabIndex INTEGER NOT NULL,
        isPinned BOOLEAN DEFAULT FALSE,
        isActive BOOLEAN DEFAULT TRUE,
        openedAt BIGINT NOT NULL,
        updatedAt BIGINT NOT NULL,
        deletedAt BIGINT,
        PRIMARY KEY (browserScope, id),
        FOREIGN KEY (browserScope, snapshotId) REFERENCES snapshots(browserScope, id)
      );

      CREATE TABLE IF NOT EXISTS settings (
        browserScope TEXT NOT NULL,
        key TEXT NOT NULL,
        value JSONB,
        PRIMARY KEY (browserScope, key)
      );

      CREATE INDEX IF NOT EXISTS idx_current_tabs_scope_window ON current_tabs(browserScope, windowId, tabIndex);
      CREATE INDEX IF NOT EXISTS idx_snapshot_tabs_scope_window ON snapshot_tabs(browserScope, snapshotId, windowId, tabIndex);
      CREATE INDEX IF NOT EXISTS idx_urls_key ON urls(urlKey);
    `);
  }

  private async upsertUrl(client: Pool | any, rawUrl: string, seenAt: number): Promise<string> {
    const urlKey = normalizeUrlKey(rawUrl);
    const urlId = getUrlId(urlKey);

    await client.query(`
      INSERT INTO urls (id, urlKey, url, firstSeenAt, lastSeenAt)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        lastSeenAt = $5
    `, [urlId, urlKey, urlKey, seenAt, seenAt]);

    return urlId;
  }

  async getCurrentSession(): Promise<any> {
    if (!this.pool) return null;

    const sessionResult = await this.pool.query(`
      SELECT id, updatedAt, windowCount, tabCount
      FROM current_session
      WHERE browserScope = $1 AND id = $2
    `, [this.browserScope, 'singleton']);
    if (sessionResult.rows.length === 0) return null;

    const windowsResult = await this.pool.query(`
      SELECT windowId, windowType, isFocused, snapIndex
      FROM current_windows
      WHERE browserScope = $1
      ORDER BY snapIndex ASC
    `, [this.browserScope]);
    const tabsResult = await this.pool.query(`
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
      WHERE current_tabs.browserScope = $1 AND current_tabs.deletedAt IS NULL
      ORDER BY current_tabs.windowId ASC, current_tabs.tabIndex ASC
    `, [this.browserScope]);

    return {
      id: sessionResult.rows[0].id,
      updatedAt: this.toNumber(sessionResult.rows[0].updatedAt ?? sessionResult.rows[0].updatedat),
      windowCount: this.toNumber(sessionResult.rows[0].windowCount ?? sessionResult.rows[0].windowcount),
      tabCount: this.toNumber(sessionResult.rows[0].tabCount ?? sessionResult.rows[0].tabcount),
      windows: windowsResult.rows.map((row) => this.normalizeWindow(row)),
      tabs: tabsResult.rows.map((row) => this.normalizeTab(row)),
    };
  }

  async saveCurrentSession(session: any): Promise<void> {
    if (!this.pool) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        INSERT INTO current_session (browserScope, id, updatedAt, windowCount, tabCount)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (browserScope, id) DO UPDATE SET
          updatedAt = $3,
          windowCount = $4,
          tabCount = $5
      `, [this.browserScope, 'singleton', session.updatedAt, session.windows.length, session.tabs.length]);

      await client.query('DELETE FROM current_windows WHERE browserScope = $1', [this.browserScope]);
      for (const win of session.windows) {
        await client.query(`
          INSERT INTO current_windows (browserScope, id, windowId, windowType, isFocused, snapIndex)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          this.browserScope,
          `${this.browserScope}:${win.windowId}`,
          win.windowId,
          win.windowType,
          win.isFocused,
          win.snapIndex,
        ]);
      }

      await client.query('DELETE FROM current_tabs WHERE browserScope = $1', [this.browserScope]);
      for (let index = 0; index < session.tabs.length; index += 1) {
        const tab = session.tabs[index];
        const urlId = await this.upsertUrl(client, tab.url, tab.updatedAt ?? session.updatedAt);

        await client.query(`
          INSERT INTO current_tabs (
            browserScope, id, urlId, windowId, title, tabIndex, isPinned, openedAt, updatedAt, deletedAt
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      WHERE browserScope = $1
      ORDER BY createdAt DESC
      LIMIT $2
    `, [this.browserScope, limit]);

    return result.rows.map((row) => this.normalizeSnapshot(row));
  }

  async getSnapshotDetail(id: string): Promise<any> {
    if (!this.pool) return null;

    const snapshotResult = await this.pool.query(`
      SELECT id, createdAt, windowCount, tabCount, summary
      FROM snapshots
      WHERE browserScope = $1 AND id = $2
    `, [this.browserScope, id]);
    if (snapshotResult.rows.length === 0) return null;

    const windowsResult = await this.pool.query(`
      SELECT windowId, windowType, isFocused, snapIndex
      FROM snapshot_windows
      WHERE browserScope = $1 AND snapshotId = $2
      ORDER BY snapIndex ASC
    `, [this.browserScope, id]);
    const tabsResult = await this.pool.query(`
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
      WHERE snapshot_tabs.browserScope = $1 AND snapshot_tabs.snapshotId = $2 AND snapshot_tabs.deletedAt IS NULL
      ORDER BY snapshot_tabs.windowId ASC, snapshot_tabs.tabIndex ASC
    `, [this.browserScope, id]);

    return {
      ...this.normalizeSnapshot(snapshotResult.rows[0]),
      windows: windowsResult.rows.map((row) => this.normalizeWindow(row)),
      tabs: tabsResult.rows.map((row) => this.normalizeTab(row)),
    };
  }

  async saveSnapshot(snapshot: any): Promise<void> {
    if (!this.pool) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        INSERT INTO snapshots (browserScope, id, createdAt, windowCount, tabCount, summary)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        this.browserScope,
        snapshot.id,
        snapshot.createdAt,
        snapshot.windowCount,
        snapshot.tabCount,
        JSON.stringify(snapshot.summary),
      ]);

      for (const win of snapshot.windows) {
        await client.query(`
          INSERT INTO snapshot_windows (browserScope, id, snapshotId, windowId, windowType, isFocused, snapIndex)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
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
        const urlId = await this.upsertUrl(client, tab.url, tab.updatedAt ?? snapshot.createdAt);

        await client.query(`
          INSERT INTO snapshot_tabs (
            browserScope, id, snapshotId, urlId, windowId, title, tabIndex, isPinned, openedAt, updatedAt, deletedAt
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
      await client.query('DELETE FROM snapshot_tabs WHERE browserScope = $1 AND snapshotId = $2', [this.browserScope, id]);
      await client.query('DELETE FROM snapshot_windows WHERE browserScope = $1 AND snapshotId = $2', [this.browserScope, id]);
      await client.query('DELETE FROM snapshots WHERE browserScope = $1 AND id = $2', [this.browserScope, id]);
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

    const result = await this.pool.query(`
      SELECT key, value
      FROM settings
      WHERE browserScope = $1
    `, [this.browserScope]);
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
          INSERT INTO settings (browserScope, key, value)
          VALUES ($1, $2, $3)
          ON CONFLICT (browserScope, key) DO UPDATE SET value = $3
        `, [this.browserScope, key, value]);
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
    await this.pool.query('DELETE FROM snapshot_tabs WHERE browserScope = $1 AND deletedAt IS NOT NULL AND deletedAt < $2', [this.browserScope, cutoff]);
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

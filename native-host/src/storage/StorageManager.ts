import { SqliteStorage } from './SqliteStorage.js';
import { PostgresStorage } from './PostgresStorage.js';
import { MysqlStorage } from './MysqlStorage.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import net from 'net';
import { logNativeHost } from '../logger.js';

type StorageType = 'sqlite' | 'postgresql' | 'mysql';
type BrowserScope = 'chrome' | 'edge' | 'firefox' | 'unknown';

interface RuntimeConfig {
  storage: { type: StorageType };
  sqlite?: { path?: string };
  postgresql?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
  };
  mysql?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
  };
}

/**
 * 存储管理器 - 统一入口
 * 根据配置选择不同的存储后端
 */
export class StorageManager {
  private storage: SqliteStorage | PostgresStorage | MysqlStorage | null = null;
  private config: RuntimeConfig | null = null;
  private browserScope: BrowserScope = 'chrome';
  private readonly legacyConfigPath = join(homedir(), '.tabrescue', 'native-host-config.json');

  async initialize(): Promise<void> {
    logNativeHost('storage_manager_initialized');
  }

  setBrowserScope(browserScope?: string): void {
    const nextScope = this.normalizeBrowserScope(browserScope);
    if (this.browserScope === nextScope) {
      return;
    }

    this.browserScope = nextScope;
    this.config = null;
    this.storage = null;
  }

  private normalizeBrowserScope(browserScope?: string): BrowserScope {
    switch ((browserScope || '').toLowerCase()) {
      case 'chrome':
      case 'edge':
      case 'firefox':
        return browserScope!.toLowerCase() as BrowserScope;
      default:
        return 'unknown';
    }
  }

  private getConfigPath(): string {
    return join(homedir(), '.tabrescue', `native-host-config.${this.browserScope}.json`);
  }

  private async setupStorage(config: RuntimeConfig): Promise<void> {
    await this.closeStorage();
    logNativeHost('setup_storage_begin', this.getSafeConfigSummary(config));

    if (config.storage.type === 'postgresql' && config.postgresql) {
      const probeResult = await this.probeTcpConnectivity(config.postgresql.host, config.postgresql.port);
      logNativeHost('postgresql_tcp_probe', probeResult);
    }

    if (config.storage.type === 'mysql' && config.mysql) {
      const probeResult = await this.probeTcpConnectivity(config.mysql.host, config.mysql.port);
      logNativeHost('mysql_tcp_probe', probeResult);
    }

    switch (config.storage.type) {
      case 'sqlite':
        this.storage = new SqliteStorage(config.sqlite?.path, this.browserScope);
        break;
      case 'postgresql':
        this.storage = new PostgresStorage(config.postgresql, this.browserScope);
        break;
      case 'mysql':
        this.storage = new MysqlStorage(config.mysql, this.browserScope);
        break;
      default:
        this.storage = new SqliteStorage(undefined, this.browserScope);
    }

    await this.storage.initialize();
    console.error(`[StorageManager] Initialized with ${config.storage.type}`);
    logNativeHost('setup_storage_success', { type: config.storage.type });
  }

  private async probeTcpConnectivity(host: string, port: number): Promise<{
    host: string;
    port: number;
    ok: boolean;
    code?: string;
    message?: string;
    localAddress?: string | null;
    localPort?: number | null;
  }> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({
          host,
          port,
          ok: false,
          code: 'TIMEOUT',
          message: 'TCP probe timeout',
          localAddress: null,
          localPort: null,
        });
      }, 3000);

      socket.once('connect', () => {
        clearTimeout(timeout);
        const result = {
          host,
          port,
          ok: true,
          localAddress: socket.localAddress || null,
          localPort: socket.localPort || null,
        };
        socket.destroy();
        resolve(result);
      });

      socket.once('error', (error) => {
        clearTimeout(timeout);
        resolve({
          host,
          port,
          ok: false,
          code: (error as NodeJS.ErrnoException).code,
          message: error.message,
          localAddress: socket.localAddress || null,
          localPort: socket.localPort || null,
        });
      });
    });
  }

  private loadConfig(): RuntimeConfig {
    return this.loadPersistedConfig() || this.loadConfigFromEnv();
  }

  private loadPersistedConfig(): RuntimeConfig | null {
    const configPath = this.getConfigPath();

    if (existsSync(configPath)) {
      try {
        return JSON.parse(readFileSync(configPath, 'utf-8')) as RuntimeConfig;
      } catch (error) {
        console.error('[StorageManager] Failed to read persisted config:', error);
        logNativeHost('load_persisted_config_error', {
          browserScope: this.browserScope,
          configPath,
          error,
        });
        return null;
      }
    }

    if (!existsSync(this.legacyConfigPath)) {
      return null;
    }

    try {
      return JSON.parse(readFileSync(this.legacyConfigPath, 'utf-8')) as RuntimeConfig;
    } catch (error) {
      console.error('[StorageManager] Failed to read legacy persisted config:', error);
      logNativeHost('load_legacy_persisted_config_error', {
        browserScope: this.browserScope,
        configPath: this.legacyConfigPath,
        error,
      });
      return null;
    }
  }

  private loadConfigFromEnv(): RuntimeConfig {
    const storageType = process.env.STORAGE_TYPE || 'sqlite';

    if (storageType === 'sqlite') {
      return {
        storage: { type: 'sqlite' },
        sqlite: {
          path: process.env.SQLITE_PATH,
        },
      };
    }

    if (storageType === 'postgresql') {
      return {
        storage: { type: 'postgresql' },
        postgresql: {
          host: process.env.PG_HOST || 'localhost',
          port: parseInt(process.env.PG_PORT || '5432'),
          database: process.env.PG_DATABASE || 'tabrescue',
          user: process.env.PG_USER || 'postgres',
          password: process.env.PG_PASSWORD || '',
          ssl: process.env.PG_SSL === 'true',
        },
      };
    }

    if (storageType === 'mysql') {
      return {
        storage: { type: 'mysql' },
        mysql: {
          host: process.env.MYSQL_HOST || 'localhost',
          port: parseInt(process.env.MYSQL_PORT || '3306'),
          database: process.env.MYSQL_DATABASE || 'tabrescue',
          user: process.env.MYSQL_USER || 'root',
          password: process.env.MYSQL_PASSWORD || '',
          ssl: process.env.MYSQL_SSL === 'true',
        },
      };
    }

    return { storage: { type: 'sqlite' } };
  }

  private deriveConfigFromSettings(settings: any): RuntimeConfig {
    const level = settings?.storage?.level ?? 2;

    if (level <= 2) {
      return {
        storage: { type: 'sqlite' },
        sqlite: {
          path: settings?.storage?.sqlite?.path || undefined,
        },
      };
    }

    const remoteType = settings?.storage?.remoteType
      ?? (settings?.storage?.mysql ? 'mysql' : 'postgresql');

    if (remoteType === 'mysql') {
      return {
        storage: { type: 'mysql' },
        mysql: {
          host: settings?.storage?.mysql?.host || 'localhost',
          port: settings?.storage?.mysql?.port || 3306,
          database: settings?.storage?.mysql?.database || 'tabrescue',
          user: settings?.storage?.mysql?.user || 'root',
          password: settings?.storage?.mysql?.password || '',
          ssl: settings?.storage?.mysql?.ssl || false,
        },
      };
    }

    return {
      storage: { type: 'postgresql' },
      postgresql: {
        host: settings?.storage?.postgresql?.host || 'localhost',
        port: settings?.storage?.postgresql?.port || 5432,
        database: settings?.storage?.postgresql?.database || 'tabrescue',
        user: settings?.storage?.postgresql?.user || 'postgres',
        password: settings?.storage?.postgresql?.password || '',
        ssl: settings?.storage?.postgresql?.ssl || false,
      },
    };
  }

  private persistConfig(config: RuntimeConfig): void {
    const configPath = this.getConfigPath();
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
    logNativeHost('persist_config', {
      browserScope: this.browserScope,
      configPath,
      config: this.getSafeConfigSummary(config),
    });
  }

  private async closeStorage(): Promise<void> {
    if (!this.storage) {
      return;
    }

    const closable = this.storage as { close?: () => Promise<void> | void };
    if (typeof closable.close === 'function') {
      await closable.close();
    }
    this.storage = null;
  }

  async shutdown(): Promise<void> {
    await this.closeStorage();
  }

  private async ensureStorageInitialized(): Promise<void> {
    if (!this.storage) {
      logNativeHost('ensure_storage_initialized', this.getSafeConfigSummary(this.config || this.loadConfig()));
      await this.setupStorage(this.config || this.loadConfig());
    }
  }

  private getSafeConfigSummary(config: RuntimeConfig | null) {
    if (!config) {
      return null;
    }

    return {
      browserScope: this.browserScope,
      storage: config.storage,
      sqlite: config.sqlite ? { path: config.sqlite.path || null } : undefined,
      postgresql: config.postgresql
        ? {
            host: config.postgresql.host,
            port: config.postgresql.port,
            database: config.postgresql.database,
            user: config.postgresql.user,
            ssl: config.postgresql.ssl || false,
          }
        : undefined,
      mysql: config.mysql
        ? {
            host: config.mysql.host,
            port: config.mysql.port,
            database: config.mysql.database,
            user: config.mysql.user,
            ssl: config.mysql.ssl || false,
          }
        : undefined,
    };
  }

  // 委托方法
  async getSnapshots(limit?: number) {
    await this.ensureStorageInitialized();
    return (this.storage as any).getSnapshots(limit);
  }

  async getSnapshotDetail(id: string) {
    await this.ensureStorageInitialized();
    return (this.storage as any).getSnapshotDetail(id);
  }

  async saveSnapshot(snapshot: any) {
    await this.ensureStorageInitialized();
    return (this.storage as any).saveSnapshot(snapshot);
  }

  async deleteSnapshot(id: string) {
    await this.ensureStorageInitialized();
    return (this.storage as any).deleteSnapshot(id);
  }

  async getSettings() {
    await this.ensureStorageInitialized();
    return (this.storage as any).getSettings();
  }

  async getPopupState(limit?: number) {
    await this.ensureStorageInitialized();
    const startedAt = Date.now();
    const snapshots = await (this.storage as any).getSnapshots(limit);
    const afterSnapshotsAt = Date.now();
    const settings = await (this.storage as any).getSettings();
    const finishedAt = Date.now();
    logNativeHost('get_popup_state_timing', {
      browserScope: this.browserScope,
      limit: limit ?? null,
      getSnapshotsMs: afterSnapshotsAt - startedAt,
      getSettingsMs: finishedAt - afterSnapshotsAt,
      totalMs: finishedAt - startedAt,
      snapshotsCount: Array.isArray(snapshots) ? snapshots.length : null,
    });
    return { snapshots, settings };
  }

  async saveSettings(settings: any) {
    const nextConfig = this.deriveConfigFromSettings(settings);
    const configChanged = JSON.stringify(this.config) !== JSON.stringify(nextConfig);
    logNativeHost('save_settings_received', {
      nextConfig: this.getSafeConfigSummary(nextConfig),
      configChanged,
    });

    this.persistConfig(nextConfig);

    if (configChanged || !this.storage) {
      this.config = nextConfig;
      try {
        await this.setupStorage(nextConfig);
      } catch (error) {
        logNativeHost('save_settings_setup_storage_error', error);
        throw error;
      }
    }

    return (this.storage as any).saveSettings(settings);
  }

  async cleanupDeletedTabs(retentionDays: number) {
    await this.ensureStorageInitialized();
    return (this.storage as any).cleanupDeletedTabs(retentionDays);
  }
}

import { SqliteStorage } from './SqliteStorage.js';
import { PostgresStorage } from './PostgresStorage.js';
import { MysqlStorage } from './MysqlStorage.js';

/**
 * 存储管理器 - 统一入口
 * 根据配置选择不同的存储后端
 */
export class StorageManager {
  private storage: SqliteStorage | PostgresStorage | MysqlStorage | null = null;
  private config: any = null;

  async initialize(): Promise<void> {
    // 读取配置（从环境变量或配置文件）
    this.config = this.loadConfig();

    // 根据配置初始化存储
    switch (this.config.storage?.type || 'sqlite') {
      case 'sqlite':
        this.storage = new SqliteStorage(this.config.sqlite?.path);
        break;
      case 'postgresql':
        this.storage = new PostgresStorage(this.config.postgresql);
        break;
      case 'mysql':
        this.storage = new MysqlStorage(this.config.mysql);
        break;
      default:
        this.storage = new SqliteStorage();
    }

    await this.storage.initialize();
    console.error(`[StorageManager] Initialized with ${this.config.storage?.type || 'sqlite'}`);
  }

  private loadConfig(): any {
    // 从环境变量加载配置
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

  // 委托方法
  async getCurrentSession() {
    return (this.storage as any).getCurrentSession();
  }

  async saveCurrentSession(session: any) {
    return (this.storage as any).saveCurrentSession(session);
  }

  async getSnapshots(limit?: number) {
    return (this.storage as any).getSnapshots(limit);
  }

  async getSnapshotDetail(id: string) {
    return (this.storage as any).getSnapshotDetail(id);
  }

  async saveSnapshot(snapshot: any) {
    return (this.storage as any).saveSnapshot(snapshot);
  }

  async deleteSnapshot(id: string) {
    return (this.storage as any).deleteSnapshot(id);
  }

  async getSettings() {
    return (this.storage as any).getSettings();
  }

  async saveSettings(settings: any) {
    return (this.storage as any).saveSettings(settings);
  }

  async cleanupDeletedTabs(retentionDays: number) {
    return (this.storage as any).cleanupDeletedTabs(retentionDays);
  }
}

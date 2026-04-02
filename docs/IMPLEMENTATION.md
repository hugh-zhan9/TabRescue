# 归屿 TabRescue - 实施文档

> 版本：v1.0  
> 创建日期：2026-04-02  
> 状态：待实施

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术架构](#2-技术架构)
3. [目录结构](#3-目录结构)
4. [数据模型设计](#4-数据模型设计)
5. [核心模块设计](#5-核心模块设计)
6. [存储层设计](#6-存储层设计)
7. [Native Messaging 协议](#7-native-messaging 协议)
8. [执行计划](#8-执行计划)
9. [验收标准](#9-验收标准)
10. [风险与缓解](#10-风险与缓解)

---

## 1. 项目概述

### 1.1 产品定位

多层次浏览器会话恢复工具，支持三种产品形态：

| 模式 | 架构 | 适用用户 |
|------|------|---------|
| Level 1 | 纯扩展 + chrome.storage.local | 轻度用户、单设备、零配置 |
| Level 2 | 扩展 + Native Messaging + SQLite | 重度用户、大容量存储需求 |
| Level 3 | 扩展 + Native Messaging + PostgreSQL/MySQL | 跨设备同步、自部署爱好者 |

### 1.2 核心价值

- 在浏览器原生恢复失效时，提供可靠的会话保存与恢复机制
- 通过可插拔的存储设计和可配置的去重策略，满足多种用户需求

### 1.3 支持浏览器

- Chrome 88+
- Edge 88+
- Firefox 90+

---

## 2. 技术架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    浏览器扩展 (Extension)                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Popup UI  │  │  Background │  │   Content Scripts   │ │
│  │   (React)   │  │   (TS)      │  │                     │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘ │
│         │                │                                    │
│         ▼                ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Service Layer                              │ │
│  │  - SessionService                                       │ │
│  │  - SnapshotService                                      │ │
│  │  - RecoveryService                                      │ │
│  └─────────────────────────────────────────────────────────┘ │
│         │                                                     │
│         ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │           Storage Repository Layer                      │ │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐  │ │
│  │  │ Level1Repository│  │    NativeRepository         │  │ │
│  │  │ (chrome.storage)│  │ (Native Messaging Host)     │  │ │
│  │  └─────────────────┘  └─────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                                   ▼
    ┌───────────────────┐             ┌───────────────────┐
    │  Level 2: Local   │             │ Level 3: Remote   │
    │   SQLite (.db)    │             │  PostgreSQL/MySQL │
    └───────────────────┘             └───────────────────┘
```

### 2.2 模块依赖关系

```
extension/
├── popup/          → React UI，依赖 services
├── background/     → 事件监听 + 业务逻辑，依赖 repository
├── services/       → 业务逻辑，依赖 repository
├── repository/     → 存储抽象，无依赖
├── types/          → 类型定义，无依赖
└── utils/          → 工具函数，无依赖
```

---

## 3. 目录结构

```
browser-session-recovery/
├── extension/                        # 浏览器扩展
│   ├── public/
│   │   ├── manifest.json             # Manifest V3
│   │   └── icons/
│   │       ├── icon16.png
│   │       ├── icon48.png
│   │       └── icon128.png
│   ├── src/
│   │   ├── background/
│   │   │   ├── index.ts              # Background 入口
│   │   │   ├── EventListener.ts      # 浏览器事件监听
│   │   │   └── SessionTracker.ts     # 会话追踪核心
│   │   ├── services/
│   │   │   ├── SessionService.ts     # 会话业务逻辑
│   │   │   ├── SnapshotService.ts    # 快照管理
│   │   │   └── RecoveryService.ts    # 恢复执行
│   │   ├── repository/
│   │   │   ├── types.ts              # Repository 接口
│   │   │   ├── Level1Repository.ts   # chrome.storage 实现
│   │   │   └── NativeRepository.ts   # Native Messaging 实现
│   │   ├── types/
│   │   │   ├── index.ts              # 核心类型
│   │   │   └── config.ts             # 配置类型
│   │   ├── utils/
│   │   │   ├── urlFilter.ts          # URL 过滤
│   │   │   ├── dedup.ts              # 去重策略
│   │   │   └── snapshot.ts           # 快照摘要
│   │   └── popup/
│   │       ├── App.tsx
│   │       ├── components/
│   │       │   ├── SnapshotList.tsx
│   │       │   ├── SnapshotItem.tsx
│   │       │   ├── WindowGroup.tsx
│   │       │   ├── Settings.tsx
│   │       │   └── Toast.tsx
│   │       ├── hooks/
│   │       │   ├── useSnapshots.ts
│   │       │   └── useSettings.ts
│   │       └── index.css
│   ├── package.json
│   ├── tsconfig.json
│   ├── webpack.config.js
│   └── vite.config.ts
│
├── native-host/                      # 本地宿主程序
│   ├── src/
│   │   ├── main.rs                   # 入口 (Rust)
│   │   ├── messaging/
│   │   │   ├── mod.rs
│   │   │   ├── protocol.rs           # 协议定义
│   │   │   └── handler.rs            # 消息处理
│   │   ├── storage/
│   │   │   ├── mod.rs
│   │   │   ├── sqlite.rs             # SQLite 实现
│   │   │   └── remote.rs             # 远程 DB 实现
│   │   ├── config.rs
│   │   └── error.rs
│   ├── native-host.json              # Native Messaging Manifest
│   ├── Cargo.toml
│   └── install.sh                    # 安装脚本
│
├── shared/                           # 共享代码
│   ├── types.ts                      # 类型定义
│   └── protocol.ts                   # 通信协议
│
├── docs/
│   ├── IMPLEMENTATION.md             # 本文档
│   └── superpowers/specs/
│       └── 2026-04-02-browser-session-recovery-design.md
│
├── tests/
│   ├── extension/
│   │   ├── services/
│   │   └── repository/
│   └── native-host/
│
├── .gitignore
├── README.md
└── package.json                      # 根目录 (monorepo)
```

---

## 4. 数据模型设计

### 4.1 核心类型定义

```typescript
// src/types/index.ts

/** 去重策略 */
export type DedupStrategy = 'strict' | 'per-window' | 'none';

/** 存储模式 */
export type StorageLevel = 1 | 2 | 3;

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

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

/** 窗口数据 */
export interface WindowData {
  windowId: string;
  windowType: chrome.window.WindowType;
  isFocused: boolean;
  snapIndex: number;
}

/** 标签页数据 */
export interface TabData {
  id?: string;          // 数据库自增 ID（可选）
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

/** 快照（历史归档） */
export interface Snapshot {
  id: string;
  createdAt: number;
  windowCount: number;
  tabCount: number;
  summary: SnapshotSummary;
}

export interface SnapshotSummary {
  createdAt: number;
  windows: Array<{
    windowId: string;
    windowType: string;
    tabCount: number;
    representativeTabs: string[]; // 前 3 个标签标题
  }>;
}

/** 快照详情（用于恢复） */
export interface SnapshotDetail extends Snapshot {
  windows: WindowData[];
  tabs: TabData[];
}
```

### 4.2 存储结构

#### Level 1: chrome.storage.local

```json
{
  "currentSession": {
    "id": "singleton",
    "updatedAt": 1712044800000,
    "windows": [...],
    "tabs": [...]
  },
  "snapshots": [
    {
      "id": "snapshot-001",
      "createdAt": 1712044800000,
      "windowCount": 2,
      "tabCount": 15,
      "summary": {...},
      "windows": [...],
      "tabs": [...]
    }
  ],
  "settings": {
    "dedup": { "strategy": "per-window" },
    "storage": { "level": 1 },
    ...
  },
  "schemaVersion": 1
}
```

#### Level 2/3: SQLite/Remote DB

```sql
-- Schema Version: 1

-- 当前会话元信息（单例）
CREATE TABLE current_session (
  id            TEXT PRIMARY KEY CHECK (id = 'singleton'),
  updatedAt     INTEGER NOT NULL,
  windowCount   INTEGER NOT NULL,
  tabCount      INTEGER NOT NULL
);

-- 当前窗口表
CREATE TABLE current_windows (
  id          TEXT PRIMARY KEY,
  windowId    TEXT NOT NULL UNIQUE,
  windowType  TEXT,
  isFocused   BOOLEAN DEFAULT FALSE,
  snapIndex   INTEGER
);

-- 当前标签页表（支持多种去重策略）
CREATE TABLE current_tabs (
  id          TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  windowId    TEXT NOT NULL,
  title       TEXT,
  tabIndex    INTEGER NOT NULL,
  isPinned    BOOLEAN DEFAULT FALSE,
  openedAt    INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL,
  deletedAt   INTEGER
);

-- 去重策略索引（根据配置选择启用）
-- strict: CREATE UNIQUE INDEX idx_current_tabs_strict ON current_tabs(url);
-- per-window: CREATE UNIQUE INDEX idx_current_tabs_per_window ON current_tabs(windowId, url);
-- none: 无索引

-- 永久 URL / 页面主表
CREATE TABLE pages (
  id            TEXT PRIMARY KEY,
  url           TEXT NOT NULL UNIQUE,
  normalizedUrl TEXT NOT NULL UNIQUE,
  title         TEXT,
  firstSeenAt   INTEGER NOT NULL,
  lastSeenAt    INTEGER NOT NULL
);

-- 快照主表
CREATE TABLE snapshots (
  id          TEXT PRIMARY KEY,
  createdAt   INTEGER NOT NULL,
  windowCount INTEGER NOT NULL,
  tabCount    INTEGER NOT NULL,
  summary     TEXT    -- JSON 格式
);

-- 快照窗口表
CREATE TABLE snapshot_windows (
  id          TEXT PRIMARY KEY,
  snapshotId  TEXT NOT NULL,
  windowId    TEXT NOT NULL,
  windowType  TEXT,
  isFocused   BOOLEAN DEFAULT FALSE,
  snapIndex   INTEGER,
  FOREIGN KEY (snapshotId) REFERENCES snapshots(id)
);

-- 快照标签页表
CREATE TABLE snapshot_tabs (
  id          TEXT PRIMARY KEY,
  snapshotId  TEXT NOT NULL,
  windowId    TEXT NOT NULL,
  pageId      TEXT NOT NULL,
  tabIndex    INTEGER NOT NULL,
  isPinned    BOOLEAN DEFAULT FALSE,
  isActive    BOOLEAN DEFAULT TRUE,
  openedAt    INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL,
  deletedAt   INTEGER,
  FOREIGN KEY (snapshotId) REFERENCES snapshots(id),
  FOREIGN KEY (pageId) REFERENCES pages(id)
);

-- 去重策略索引
-- strict: CREATE UNIQUE INDEX idx_snapshot_tabs_strict ON snapshot_tabs(snapshotId, pageId);
-- per-window: CREATE UNIQUE INDEX idx_snapshot_tabs_per_window ON snapshot_tabs(snapshotId, windowId, pageId);
-- none: 无索引

-- 用户配置表
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

数据库模式说明：

- `pages` 是长期保留的 URL 资产表，按标准化 URL 唯一索引去重。
- `snapshot_tabs` 只保存快照与页面的关联，不重复承担 URL 主存储职责。
- 删除旧快照时，只删除 `snapshots`、`snapshot_windows`、`snapshot_tabs`，不删除 `pages`。

---

## 5. 核心模块设计

### 5.1 EventListener.ts

```typescript
// src/background/EventListener.ts

import { SessionTracker } from './SessionTracker';
import { shouldCollect } from '../utils/urlFilter';

export class EventListener {
  private tracker: SessionTracker;

  constructor(tracker: SessionTracker) {
    this.tracker = tracker;
  }

  public setup() {
    this.setupTabListeners();
    this.setupWindowListeners();
    this.setupRuntimeListeners();
  }

  private setupTabListeners() {
    // 标签页创建
    chrome.tabs.onCreated.addListener(async (tab) => {
      if (!tab.id) return;
      if (shouldCollect(tab)) {
        await this.tracker.onTabCreated(tab);
      }
    });

    // 标签页关闭
    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
      await this.tracker.onTabClosed(tabId);
    });

    // 标签页更新
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (!tab.id) return;
      if (shouldCollect(tab) && (changeInfo.url || changeInfo.title)) {
        await this.tracker.onTabUpdated(tab);
      }
    });

    // 标签页移动
    chrome.tabs.onMoved.addListener(async (tabId, moveInfo) => {
      await this.tracker.onTabMoved(tabId, moveInfo);
    });

    // 标签页激活
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      await this.tracker.onTabActivated(activeInfo);
    });
  }

  private setupWindowListeners() {
    // 窗口创建
    chrome.windows.onCreated.addListener(async (window) => {
      await this.tracker.onWindowCreated(window);
    });

    // 窗口关闭
    chrome.windows.onRemoved.addListener(async (windowId) => {
      await this.tracker.onWindowClosed(windowId);
    });

    // 窗口聚焦变化
    chrome.windows.onFocusChanged.addListener(async (windowId) => {
      await this.tracker.onWindowFocused(windowId);
    });
  }

  private setupRuntimeListeners() {
    // 扩展安装/更新
    chrome.runtime.onInstalled.addListener(async (details) => {
      if (details.reason === 'install') {
        await this.tracker.initialize();
      }
    });

    // 浏览器启动（通过 session API 检测）
    chrome.runtime.onStartup.addListener(async () => {
      await this.tracker.fullCapture();
    });
  }
}
```

### 5.2 SessionTracker.ts

```typescript
// src/background/SessionTracker.ts

import {
  CurrentSession,
  TabData,
  WindowData,
  Settings,
  DedupStrategy,
} from '../types';
import { StorageRepository } from '../repository/types';
import { SnapshotService } from '../services/SnapshotService';

export class SessionTracker {
  private repository: StorageRepository;
  private snapshotService: SnapshotService;
  private settings: Settings;
  private throttleTimer?: NodeJS.Timeout;

  constructor(
    repository: StorageRepository,
    snapshotService: SnapshotService
  ) {
    this.repository = repository;
    this.snapshotService = snapshotService;
    this.settings = this.getDefaultSettings();
  }

  private getDefaultSettings(): Settings {
    return {
      dedup: { strategy: 'per-window' },
      storage: { level: 1 },
      snapshot: { maxSnapshots: 20, autoSaveInterval: 5 },
      ui: { showRecoveryPromptOnStartup: false },
    };
  }

  public async initialize() {
    // 加载配置
    const savedSettings = await this.repository.getSettings();
    this.settings = { ...this.getDefaultSettings(), ...savedSettings };

    // 浏览器启动时补采
    await this.fullCapture();

    // 启动节流定时器
    this.startThrottleTimer();
  }

  public async fullCapture() {
    const windows = await chrome.windows.getAll({ populate: true });
    
    const sessionWindows: WindowData[] = windows.map((w, idx) => ({
      windowId: w.id!.toString(),
      windowType: w.type,
      isFocused: w.focused || false,
      snapIndex: idx,
    }));

    const sessionTabs: TabData[] = [];
    for (const win of windows) {
      for (const tab of win.tabs || []) {
        if (this.shouldCollect(tab)) {
          sessionTabs.push({
            url: tab.url!,
            windowId: win.id!.toString(),
            title: tab.title,
            tabIndex: tab.index,
            isPinned: tab.pinned || false,
            openedAt: Date.now(),
            updatedAt: Date.now(),
            deletedAt: null,
          });
        }
      }
    }

    const currentSession: CurrentSession = {
      id: 'singleton',
      updatedAt: Date.now(),
      windows: sessionWindows,
      tabs: sessionTabs,
    };

    await this.repository.saveCurrentSession(currentSession);
  }

  public async onTabCreated(tab: chrome.tabs.Tab) {
    if (!tab.url || !tab.windowId) return;

    const session = await this.repository.getCurrentSession();
    if (!session) return;

    const { strategy } = this.settings.dedup;
    const existingIndex = this.findIndexByKey(
      session.tabs,
      tab.url,
      tab.windowId.toString(),
      strategy
    );

    if (existingIndex >= 0) {
      // UPSERT - 更新
      session.tabs[existingIndex].windowId = tab.windowId.toString();
      session.tabs[existingIndex].updatedAt = Date.now();
    } else {
      // INSERT - 新增
      session.tabs.push({
        url: tab.url,
        windowId: tab.windowId.toString(),
        title: tab.title,
        tabIndex: 0,
        isPinned: tab.pinned || false,
        openedAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      });
    }

    session.updatedAt = Date.now();
    await this.repository.saveCurrentSession(session);
  }

  public async onTabClosed(tabId: number) {
    const session = await this.repository.getCurrentSession();
    if (!session) return;

    // 找到对应的标签页并逻辑删除
    const tab = session.tabs.find((t) => t.id === tabId.toString());
    if (tab) {
      tab.deletedAt = Date.now();
      tab.updatedAt = Date.now();
      await this.repository.saveCurrentSession(session);
    }
  }

  public async onTabUpdated(tab: chrome.tabs.Tab) {
    if (!tab.url || !tab.id) return;
    // 类似于 onTabCreated 的逻辑
  }

  private findIndexByKey(
    tabs: TabData[],
    url: string,
    windowId: string,
    strategy: DedupStrategy
  ): number {
    switch (strategy) {
      case 'strict':
        return tabs.findIndex((t) => t.url === url);
      case 'per-window':
        return tabs.findIndex((t) => t.url === url && t.windowId === windowId);
      case 'none':
        return -1;
    }
  }

  private startThrottleTimer() {
    if (this.throttleTimer) {
      clearInterval(this.throttleTimer);
    }

    const interval = this.settings.snapshot.autoSaveInterval * 60 * 1000;
    this.throttleTimer = setInterval(async () => {
      await this.snapshotService.createSnapshot();
    }, interval);
  }

  private shouldCollect(tab: chrome.tabs.Tab): boolean {
    if (tab.incognito) return false;
    if (!tab.url) return false;

    const excludedPrefixes = [
      'chrome://',
      'about:',
      'edge://',
      'chrome-extension://',
      'moz-extension://',
      'chrome-newtab://',
      'about:newtab',
      'data:',
      'javascript:',
      'ftp://',
    ];

    return !excludedPrefixes.some((p) => tab.url.startsWith(p));
  }
}
```

### 5.3 SnapshotService.ts

```typescript
// src/services/SnapshotService.ts

import { Snapshot, SnapshotDetail, CurrentSession } from '../types';
import { StorageRepository } from '../repository/types';

export class SnapshotService {
  private repository: StorageRepository;

  constructor(repository: StorageRepository) {
    this.repository = repository;
  }

  public async createSnapshot(): Promise<Snapshot> {
    const session = await this.repository.getCurrentSession();
    if (!session) throw new Error('No current session');

    const snapshotId = this.generateId();
    const now = Date.now();

    // 过滤已删除的标签页
    const activeTabs = session.tabs.filter((t) => !t.deletedAt);

    // 按窗口分组
    const windowTabs = new Map<string, typeof activeTabs>();
    for (const tab of activeTabs) {
      const tabs = windowTabs.get(tab.windowId) || [];
      tabs.push(tab);
      windowTabs.set(tab.windowId, tabs);
    }

    const snapshot: SnapshotDetail = {
      id: snapshotId,
      createdAt: now,
      windowCount: session.windows.length,
      tabCount: activeTabs.length,
      summary: this.generateSummary(session, windowTabs),
      windows: session.windows,
      tabs: activeTabs,
    };

    await this.repository.saveSnapshot(snapshot);

    // 清理过期快照
    await this.cleanupOldSnapshots();

    return snapshot;
  }

  public async getSnapshots(limit: number = 20): Promise<Snapshot[]> {
    return this.repository.getSnapshots(limit);
  }

  public async getSnapshotDetail(id: string): Promise<SnapshotDetail> {
    return this.repository.getSnapshotDetail(id);
  }

  private generateSummary(
    session: CurrentSession,
    windowTabs: Map<string, TabData[]>
  ) {
    const windows = session.windows.map((w) => {
      const tabs = windowTabs.get(w.windowId) || [];
      return {
        windowId: w.windowId,
        windowType: w.windowType,
        tabCount: tabs.length,
        representativeTabs: tabs.slice(0, 3).map((t) => t.title || t.url),
      };
    });

    return {
      createdAt: session.updatedAt,
      windows,
    };
  }

  private async cleanupOldSnapshots() {
    const snapshots = await this.repository.getSnapshots(100);
    const maxSnapshots = (await this.repository.getSettings()).snapshot
      ?.maxSnapshots || 20;

    if (snapshots.length > maxSnapshots) {
      const toDelete = snapshots.slice(maxSnapshots);
      for (const snapshot of toDelete) {
        await this.repository.deleteSnapshot(snapshot.id);
      }
    }
  }

  private generateId(): string {
    return `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 5.4 RecoveryService.ts

```typescript
// src/services/RecoveryService.ts

import { SnapshotDetail, Settings } from '../types';
import { StorageRepository } from '../repository/types';

export class RecoveryService {
  private repository: StorageRepository;
  private isRestoring = false;
  private lastRestoredSnapshotId: string | null = null;
  private lastRestoredAt: number | null = null;

  constructor(repository: StorageRepository) {
    this.repository = repository;
  }

  public async restoreSnapshot(
    snapshotId: string,
    options?: { force?: boolean }
  ): Promise<RecoveryResult> {
    // 幂等保护
    if (this.isRestoring) {
      throw new Error('Recovery in progress');
    }

    // 检查重复恢复
    const now = Date.now();
    if (
      !options?.force &&
      this.lastRestoredSnapshotId === snapshotId &&
      this.lastRestoredAt &&
      now - this.lastRestoredAt < 5 * 60 * 1000
    ) {
      throw new Error('Recently restored, confirm to restore again');
    }

    this.isRestoring = true;

    try {
      const snapshot = await this.repository.getSnapshotDetail(snapshotId);
      const result = await this.executeRecovery(snapshot);

      this.lastRestoredSnapshotId = snapshotId;
      this.lastRestoredAt = now;

      return result;
    } finally {
      this.isRestoring = false;
    }
  }

  private async executeRecovery(
    snapshot: SnapshotDetail
  ): Promise<RecoveryResult> {
    const result: RecoveryResult = {
      success: true,
      windowsCreated: 0,
      tabsCreated: 0,
      failedTabs: [],
    };

    // 按窗口恢复
    for (const window of snapshot.windows) {
      const windowTabs = snapshot.tabs.filter(
        (t) => t.windowId === window.windowId
      );

      if (windowTabs.length === 0) continue;

      try {
        // 创建新窗口
        const chromeWindow = await chrome.windows.create({
          type: 'normal',
          focused: false,
        });

        result.windowsCreated++;

        // 创建标签页
        for (const tab of windowTabs) {
          try {
            await chrome.tabs.create({
              windowId: chromeWindow.id,
              url: tab.url,
              active: false,
              pinned: tab.isPinned,
            });
            result.tabsCreated++;
          } catch (err) {
            result.failedTabs.push({
              url: tab.url,
              reason: (err as Error).message,
            });
          }
        }
      } catch (err) {
        // 窗口创建失败
      }
    }

    // 关闭空窗口（浏览器创建的默认窗口）
    await this.closeEmptyDefaultWindow();

    return result;
  }

  private async closeEmptyDefaultWindow() {
    // 实现逻辑：关闭浏览器启动时创建的默认空窗口
  }

  public getRecoveryProgress(): {
    isRestoring: boolean;
    lastRestoredSnapshotId: string | null;
    lastRestoredAt: number | null;
  } {
    return {
      isRestoring: this.isRestoring,
      lastRestoredSnapshotId: this.lastRestoredSnapshotId,
      lastRestoredAt: this.lastRestoredAt,
    };
  }
}

export interface RecoveryResult {
  success: boolean;
  windowsCreated: number;
  tabsCreated: number;
  failedTabs: Array<{ url: string; reason: string }>;
}
```

---

## 6. 存储层设计

### 6.1 Repository 接口

```typescript
// src/repository/types.ts

import {
  CurrentSession,
  Snapshot,
  SnapshotDetail,
  Settings,
} from '../types';

export interface StorageRepository {
  // CurrentSession
  getCurrentSession(): Promise<CurrentSession | null>;
  saveCurrentSession(session: CurrentSession): Promise<void>;

  // Snapshots
  getSnapshots(limit?: number): Promise<Snapshot[]>;
  getSnapshotDetail(id: string): Promise<SnapshotDetail | null>;
  saveSnapshot(snapshot: SnapshotDetail): Promise<void>;
  deleteSnapshot(id: string): Promise<void>;

  // Settings
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
}
```

### 6.2 Level1Repository 实现

```typescript
// src/repository/Level1Repository.ts

import { StorageRepository } from './types';
import {
  CurrentSession,
  Snapshot,
  SnapshotDetail,
  Settings,
} from '../types';

export class Level1Repository implements StorageRepository {
  private STORAGE_KEY_CURRENT = 'currentSession';
  private STORAGE_KEY_SNAPSHOTS = 'snapshots';
  private STORAGE_KEY_SETTINGS = 'settings';

  async getCurrentSession(): Promise<CurrentSession | null> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY_CURRENT);
    return result[this.STORAGE_KEY_CURRENT] || null;
  }

  async saveCurrentSession(session: CurrentSession): Promise<void> {
    await chrome.storage.local.set({
      [this.STORAGE_KEY_CURRENT]: session,
    });
  }

  async getSnapshots(limit: number = 20): Promise<Snapshot[]> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY_SNAPSHOTS);
    const snapshots = result[this.STORAGE_KEY_SNAPSHOTS] || [];
    return snapshots
      .sort((a: Snapshot, b: Snapshot) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async getSnapshotDetail(id: string): Promise<SnapshotDetail | null> {
    const snapshots = await this.getSnapshots(100);
    return snapshots.find((s) => s.id === id) as SnapshotDetail | null;
  }

  async saveSnapshot(snapshot: SnapshotDetail): Promise<void> {
    const snapshots = await this.getSnapshots(100);
    snapshots.unshift(snapshot);
    await chrome.storage.local.set({
      [this.STORAGE_KEY_SNAPSHOTS]: snapshots,
    });
  }

  async deleteSnapshot(id: string): Promise<void> {
    const snapshots = await this.getSnapshots(100);
    const filtered = snapshots.filter((s) => s.id !== id);
    await chrome.storage.local.set({
      [this.STORAGE_KEY_SNAPSHOTS]: filtered,
    });
  }

  async getSettings(): Promise<Settings> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY_SETTINGS);
    return result[this.STORAGE_KEY_SETTINGS] || this.getDefaultSettings();
  }

  async saveSettings(settings: Settings): Promise<void> {
    await chrome.storage.local.set({
      [this.STORAGE_KEY_SETTINGS]: settings,
    });
  }

  private getDefaultSettings(): Settings {
    return {
      dedup: { strategy: 'per-window' },
      storage: { level: 1 },
      snapshot: { maxSnapshots: 20, autoSaveInterval: 5 },
      ui: { showRecoveryPromptOnStartup: false },
    };
  }
}
```

### 6.3 NativeRepository 实现

```typescript
// src/repository/NativeRepository.ts

import { StorageRepository } from './types';
import {
  CurrentSession,
  Snapshot,
  SnapshotDetail,
  Settings,
} from '../types';
import { COMMANDS, Response, Command } from '../../shared/protocol';

export class NativeRepository implements StorageRepository {
  private port: chrome.runtime.Port;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  constructor(private hostName: string) {
    this.port = chrome.runtime.connectNative(hostName);
    this.port.onMessage.addListener(this.handleMessage.bind(this));
  }

  private handleMessage(response: Response) {
    const listeners = this.listeners.get(response.action);
    if (listeners) {
      listeners.forEach((cb) => cb(response.data));
    }
  }

  private async sendCommand<T>(action: string, params?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const listener = (data: any) => {
        if (data.success) {
          resolve(data);
        } else {
          reject(new Error(data.error));
        }
      };

      if (!this.listeners.has(action)) {
        this.listeners.set(action, new Set());
      }
      this.listeners.get(action)!.add(listener);

      const command: Command = { action, params };
      this.port.postMessage(command);

      // 超时处理
      setTimeout(() => {
        this.listeners.get(action)!.delete(listener);
        reject(new Error('Command timeout'));
      }, 5000);
    });
  }

  async getCurrentSession(): Promise<CurrentSession | null> {
    return this.sendCommand(COMMANDS.GET_CURRENT_SESSION);
  }

  async saveCurrentSession(session: CurrentSession): Promise<void> {
    await this.sendCommand(COMMANDS.SAVE_CURRENT_SESSION, { session });
  }

  async getSnapshots(limit?: number): Promise<Snapshot[]> {
    return this.sendCommand(COMMANDS.GET_SNAPSHOTS, { limit });
  }

  async getSnapshotDetail(id: string): Promise<SnapshotDetail | null> {
    return this.sendCommand(COMMANDS.GET_SNAPSHOT_DETAIL, { id });
  }

  async saveSnapshot(snapshot: SnapshotDetail): Promise<void> {
    await this.sendCommand(COMMANDS.SAVE_SNAPSHOT, { snapshot });
  }

  async deleteSnapshot(id: string): Promise<void> {
    await this.sendCommand(COMMANDS.DELETE_SNAPSHOT, { id });
  }

  async getSettings(): Promise<Settings> {
    return this.sendCommand(COMMANDS.GET_SETTINGS);
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.sendCommand(COMMANDS.SAVE_SETTINGS, { settings });
  }
}
```

---

## 7. Native Messaging 协议

### 7.1 协议定义

```typescript
// shared/protocol.ts

export const COMMANDS = {
  GET_CURRENT_SESSION: 'get_current_session',
  SAVE_CURRENT_SESSION: 'save_current_session',
  GET_SNAPSHOTS: 'get_snapshots',
  GET_SNAPSHOT_DETAIL: 'get_snapshot_detail',
  SAVE_SNAPSHOT: 'save_snapshot',
  DELETE_SNAPSHOT: 'delete_snapshot',
  GET_SETTINGS: 'get_settings',
  SAVE_SETTINGS: 'save_settings',
} as const;

export interface Command {
  action: (typeof COMMANDS)[keyof typeof COMMANDS];
  params?: Record<string, any>;
}

export interface Response<T = any> {
  action: string;
  success: boolean;
  data?: T;
  error?: string;
}
```

### 7.2 Native Host Manifest

```json
// native-host/native-host.json
{
  "name": "com.browser-session.native-host",
  "description": "Native host for 归屿 TabRescue",
  "path": "/path/to/native-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<extension-id>/"
  ]
}
```

### 7.3 Rust 实现框架

```rust
// native-host/src/main.rs

use std::io::{self, Read, Write};

mod messaging;
mod storage;
mod config;
mod error;

fn main() -> Result<(), error::Error> {
    let mut stdin = io::stdin();
    let mut stdout = io::stdout();
    
    loop {
        // 读取消息长度（4 字节）
        let mut len_bytes = [0u8; 4];
        stdin.read_exact(&mut len_bytes)?;
        let len = u32::from_le_bytes(len_bytes) as usize;
        
        // 读取消息内容
        let mut buffer = vec![0u8; len];
        stdin.read_exact(&mut buffer)?;
        
        // 解析命令
        let command: Command = serde_json::from_slice(&buffer)?;
        
        // 处理命令
        let response = handle_command(command)?;
        
        // 返回响应
        let response_bytes = serde_json::to_vec(&response)?;
        let len_bytes = (response_bytes.len() as u32).to_le_bytes();
        stdout.write_all(&len_bytes)?;
        stdout.write_all(&response_bytes)?;
        stdout.flush()?;
    }
}
```

---

## 8. 执行计划

### 8.1 Phase 1: 项目初始化（1-2 天）

**工作内容**:
- [ ] 创建项目目录结构
- [ ] 配置 `package.json`、`tsconfig.json`
- [ ] 创建 `manifest.json` (Manifest V3)
- [ ] 配置构建工具 (webpack/vite)
- [ ] 搭建基础类型定义

**交付物**:
- 可扩展的项目框架
- TypeScript 编译通过
- 扩展可加载到浏览器

### 8.2 Phase 2: Level 1 核心功能（3-4 天）

**工作内容**:
- [ ] 实现 `EventListener` 类
- [ ] 实现 `SessionTracker` 类
- [ ] 实现 `Level1Repository`
- [ ] 实现 URL 过滤逻辑
- [ ] 实现去重策略
- [ ] 实现节流和定时快照机制

**交付物**:
- 会话采集功能完整
- 数据存储到 chrome.storage.local
- 可通过 DevTools 验证数据

### 8.3 Phase 3: 恢复功能（2-3 天）

**工作内容**:
- [ ] 实现 `SnapshotService`
- [ ] 实现 `RecoveryService`
- [ ] 实现分级确认逻辑
- [ ] 实现幂等保护
- [ ] 实现恢复失败处理

**交付物**:
- 可生成快照
- 可恢复会话
- 恢复失败有提示

### 8.4 Phase 4: UI 开发（2-3 天）

**工作内容**:
- [ ] 搭建 React + TypeScript UI 框架
- [ ] 实现 Popup 主页面
- [ ] 实现 `SnapshotList` 组件
- [ ] 实现 `Settings` 页面
- [ ] 实现角标提示逻辑
- [ ] 实现 Toast 组件

**交付物**:
- 可用的 Popup 界面
- 可浏览快照列表
- 可配置设置

### 8.5 Phase 5: Level 2 本地宿主（3-4 天）

**工作内容**:
- [ ] 创建 `native-host` 目录
- [ ] 实现 Native Messaging 协议解析
- [ ] 实现 SQLite 存储层
- [ ] 创建 `native-host.json` manifest
- [ ] 实现数据迁移（Level 1 → Level 2）
- [ ] 实现安装脚本

**交付物**:
- 本地宿主程序可运行
- 扩展可连接宿主
- 数据可迁移

### 8.6 Phase 6: Level 3 远程 DB（2-3 天）

**工作内容**:
- [ ] 实现 `RemoteDbRepository`
- [ ] PostgreSQL 适配器
- [ ] MySQL 适配器
- [ ] 数据库连接配置
- [ ] 实现数据迁移（Level 2 → Level 3）
- [ ] TLS 加密传输支持

**交付物**:
- 可连接远程数据库
- 支持 PostgreSQL/MySQL

### 8.7 Phase 7: 测试与发布（2-3 天）

**工作内容**:
- [ ] 编写单元测试（Jest）
- [ ] 编写集成测试
- [ ] 编写 README.md
- [ ] 编写安装指南
- [ ] 配置 Chrome Web Store 发布
- [ ] 编写 CHANGELOG

**交付物**:
- 测试覆盖率 >80%
- 完整的文档
- 可发布的扩展包

---

## 9. 验收标准

### 9.1 核心功能

| 测试项 | 预期结果 |
|--------|---------|
| 打开/关闭标签页 | 数据实时记录 |
| 浏览器异常退出后重启 | 可恢复最近会话 |
| 恢复结果 | 保持原窗口数、标签顺序 |
| URL 过滤 | 内部页、隐私窗口不记录 |

### 9.2 存储模式

| 模式 | 验收标准 |
|------|---------|
| Level 1 | 纯扩展模式正常工作 |
| Level 2 | 本地宿主可安装使用 |
| Level 3 | 远程 DB 可连接 |

### 9.3 去重策略

| 策略 | 验收标准 |
|------|---------|
| strict | 全局唯一 |
| per-window | 按窗口去重 |
| none | 完全不去重 |

---

## 10. 风险与缓解

### 10.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Manifest V3 限制 | Service Worker 生命周期短 | 使用 chrome.alarms API |
| chrome.storage 容量 | 5-10MB 限制 | Level 1 仅存最近数据 |
| Native Messaging 安装 | 用户需运行安装脚本 | 提供一键安装脚本 |

### 10.2 产品风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 浏览器兼容差异 | 功能不一致 | 抽象适配层 |
| 用户隐私顾虑 | URL 明文存储 | README 明确提示 |

---

## 附录

### A. 关键 API 参考

- [chrome.tabs](https://developer.chrome.com/docs/extensions/reference/tabs/)
- [chrome.windows](https://developer.chrome.com/docs/extensions/reference/windows/)
- [chrome.storage](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)

### B. 依赖清单

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.246",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  }
}
```

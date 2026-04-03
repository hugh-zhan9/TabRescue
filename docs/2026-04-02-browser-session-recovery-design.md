# 归屿 TabRescue 需求与设计

## 1. 背景

用户因为系统异常重启导致浏览器被强制关闭。重启后，浏览器未能可靠触发“恢复上次会话”能力，之前打开的标签页全部丢失。

目标是提供一个独立于浏览器原生自动恢复机制的工具，持续记录当前打开的标签页和窗口状态，并在浏览器重启后提供稳定、明确、可控的恢复能力。

## 2. 产品目标

- 在浏览器运行期间，持续记录当前所有窗口和标签页状态。
- 在浏览器异常退出、系统重启、浏览器未触发自动恢复时，仍可恢复最近一次已保存的会话。
- 不依赖浏览器”崩溃恢复”功能本身。
- 提供简单直接的一键恢复体验。
- 方案适合开源发布，安装和使用门槛低。
- 支持多层次产品形态，用户可根据需求选择：
  - Level 1: 纯扩展模式（默认，轻量级）
  - Level 2: 扩展 + 本地宿主（SQLite，大容量）
  - Level 3: 扩展 + 远程 DB（跨设备同步）
- URL 去重策略可配置，用户可选择严格去重、按窗口去重或完全不去重。

## 3. 非目标

- 首版不支持 Safari，但设计时避免使用明显阻断 Safari 兼容演进的专有结构。
- 首版不做云端账号体系（但支持用户自部署远程 DB）。
- 首版不做复杂的历史分析、标签分组智能整理、AI 分类等增强功能。
- 首版不保证恢复标签页的滚动位置、表单内容、登录态或页面内部运行状态。

**注意**：
- 跨设备同步通过 Level 3（远程 DB 模式）支持，但需要用户自部署数据库，默认不开启。
- 首版默认采用 Level 1（纯扩展模式），Level 2/3 作为高级功能可选。

## 4. 目标用户与核心场景

### 4.1 目标用户

- 经常同时打开大量标签页的知识工作者。
- 对浏览器原生恢复能力不信任、希望主动控制会话恢复的用户。
- 希望使用开源、可本地运行、无云端依赖工具的用户。

### 4.2 核心场景

1. 用户正常使用浏览器时，扩展在后台实时记录窗口与标签状态。
2. 浏览器或系统异常退出后，用户重新打开浏览器。
3. 扩展检测到存在可恢复的最近会话快照。
4. 用户可以选择：
   - 一键恢复最近会话。
   - 从历史快照中选择一个会话恢复。
   - 查看快照摘要后再决定是否恢复。

## 5. 方案选择

首版采用 `WebExtensions 浏览器扩展` 方案，优先支持：

- Chrome
- Edge
- Firefox

选择该方案的原因：

- 可直接监听标签页和窗口事件，数据实时性最好。
- 安装和理解成本最低，最适合开源推广。
- 用户恢复操作发生在浏览器内部，使用路径自然。
- Chrome / Edge / Firefox 共享较高比例的扩展 API，首版适配成本可控。

### 5.1 Safari 支持路线

首版不支持 Safari，但架构设计遵循以下原则：

1. **数据模型通用化**：不使用 Chrome 专属字段
2. **适配器模式**：浏览器差异收口在薄适配层
3. **降级策略**：Safari 接入时可接受简化的窗口恢复逻辑
4. **构建隔离**：共享代码与浏览器特定代码分离

Safari 关键差异与应对：

| 维度 | Chrome/Edge/Firefox | Safari | 应对策略 |
|------|---------------------|--------|----------|
| 扩展格式 | 标准 WebExtensions | 需封装为 `.appex` | 构建层隔离 |
| Windows API | 完整支持 | 有限支持 | 适配器降级 |
| 存储 API | 完整支持 | 支持 | 通用抽象层 |
| 分发渠道 | 扩展商店 | Mac App Store | 发布流程独立 |

Safari 支持预计工作量：1-2 周（在首版基础上）

### 5.2 多层次产品形态

首版支持三种产品形态，用户可根据需求选择：

| 模式 | 架构 | 存储介质 | 适用场景 |
|------|------|---------|---------|
| **Level 1: 纯扩展** | 仅浏览器扩展 | `chrome.storage.local` | 轻度用户、单设备、零配置 |
| **Level 2: 扩展 + 本地宿主** | 扩展 + Native Messaging + 本地程序 | SQLite 本地 `.db` 文件 | 重度用户、大容量存储需求 |
| **Level 3: 扩展 + 远程 DB** | 扩展 + Native Messaging + 远程服务 | PostgreSQL / MySQL | 跨设备同步、自部署爱好者 |

**默认模式**：Level 1（纯扩展），安装即用，零配置。

**升级路径**：
- Level 1 → Level 2：安装本地宿主程序，数据迁移到 SQLite。
- Level 2 → Level 3：配置远程数据库连接，实现跨设备同步。

### 5.3 存储架构原则

1. **存储抽象层**：业务逻辑不直接依赖具体存储实现。
2. **统一数据模型**：三种模式使用相同的数据结构。
3. **用户可选**：通过配置文件或 UI 设置切换存储模式。
4. **Native Messaging**：Level 2/3 通过 Native Messaging 与本地宿主通信。
5. **默认本地**：首版默认使用 Level 1，降低使用门槛。
6. **Level 2/3 永久 URL 库**：数据库模式下，URL / 页面记录是长期资产，不随快照删除而删除。

## 6. 功能需求

### 6.1 会话采集

- 记录当前所有浏览器窗口。
- 记录每个窗口下的所有标签页。
- 对每个标签页至少保存以下字段：
  - URL
  - 标题
  - 所属窗口 ID
  - 标签顺序索引（相对于窗口内）
  - 采集时间
- 对每个窗口至少保存以下字段：
  - 窗口标识
  - 窗口类型
  - 是否聚焦
  - 采集时间

**URL 去重策略（可配置）**：

| 策略 | 行为 | 适用场景 |
|------|------|---------|
| **strict（严格去重）** | 全局唯一，相同 URL 只存一份 | 节省存储，不关心窗口结构 |
| **per-window（按窗口去重）** | 同一窗口内去重，跨窗口可重复 | 平衡存储和准确性（推荐默认） |
| **none（完全不去重）** | 每个标签页独立记录 | 100% 忠实恢复原会话 |

默认策略：`per-window`

### 6.2 实时保存

**双写模型**：

```
┌────────────────────────────────────────────────┐
│ currentSession (实时态，主数据)                 │
│ - 每个事件立即更新                             │
│ - 始终反映浏览器当前真实状态                    │
│ - 用于生成快照，不直接作为主恢复入口            │
├────────────────────────────────────────────────┤
│ snapshots (归档态，派生数据)                    │
│ - 每 N 分钟从 currentSession 复制一份            │
│ - 或者用户手动触发"立即保存"时生成              │
│ - 用于历史回溯、多时间点恢复                    │
│ - Popup 的恢复入口只面向 snapshots              │
└────────────────────────────────────────────────┘
```

**事件处理流程**：

1. 监听标签页创建、关闭、更新、激活、移动事件。
2. 监听窗口创建、关闭、聚焦变化事件。
3. 事件发生后立即更新 `currentSession`。
4. 节流触发（默认每 5 分钟）→ 从 `currentSession` 复制一份到 `snapshots`。
5. 用户手动保存 → 立即生成一份 `snapshots`。
6. 浏览器启动时补采一次当前完整状态，更新 `currentSession`。

**写入优化**：

- `currentSession`：每次事件后写入（增量更新）。
- `snapshots`：仅节流触发或手动触发时写入（完整归档）。
- 避免高频事件导致频繁写入完整快照。

### 6.6 标签页生命周期管理

**1. 打开标签页（tabs.onCreated）**

- 检测到新标签页创建时，立即落库。
- 采用 **UPSERT 策略**，根据去重策略决定 Key：
  - `strict` 模式：`ON CONFLICT(url)`
  - `per-window` 模式：`ON CONFLICT(windowId, url)`
  - `none` 模式：总是 INSERT（不去重）

**2. 关闭标签页（tabs.onRemoved）**

- 检测到标签页关闭时，执行**逻辑删除**。
- 设置 `deletedAt` 时间戳，而非物理删除。
- 保留历史记录用于后续分析或恢复。

**3. URL 去重规则（可配置）**

| 策略 | 去重 Key | 行为 |
|------|---------|------|
| **strict** | `url` | 全局唯一，相同 URL 只存一份 |
| **per-window** | `windowId + url` | 同一窗口内去重，跨窗口可重复 |
| **none** | 无 | 每个标签页独立记录 |

默认策略：`per-window`

**4. 删除记录策略**

- 关闭标签页后的 `deletedAt` 仅作为内部状态校准字段，不作为用户可配置能力暴露。
- 当前版本不提供“手动清理已删除记录”入口。
- 用户可见的数据保留策略聚焦于 `snapshots` 的数量上限，而不是删除记录保留天数。

### 6.3 快照管理

**currentSession 与 snapshots 的关系**：

| 维度 | currentSession | snapshots |
|------|---------------|-----------|
| 角色 | 主数据（Source of Truth） | 派生数据（Snapshot Archive） |
| 数量 | 单例（每个浏览器实例一份） | 列表（最近 N 份） |
| 更新时机 | 每个事件立即更新 | 周期性/手动触发 |
| 崩溃恢复 | 内部采集态，不作为主恢复入口 | 主恢复来源 |
| 存储位置 | 独立的 `current_*` 表 | `snapshots` 表 |

**管理规则**：

- 持续维护最近 N 份会话快照（默认 20 份）。
- 每份快照应包含完整窗口和标签页结构。
- 至少保留”最近一次完整快照”。
- 快照需具备可读摘要，例如：
  - 创建时间
  - 窗口数量
  - 标签页数量
  - 前几个代表性标签标题

**空会话保护**：

- `currentSession` 为空时，不生成快照。
- `currentSession` 中没有有效可恢复标签页时，不生成快照。
- 浏览器刚启动、仅有空白页或内部页时，不触发噪音快照。
- 浏览器重启后，`currentSession` 可能被新的全量采集结果覆盖，因此跨重启恢复必须以 `snapshots` 为准。

### 6.4 恢复能力

- 支持一键恢复最近一次快照。
- 支持从历史快照列表中选择恢复。
- 恢复时应尽量按原窗口结构与标签顺序重建。
- 恢复动作默认在新窗口中执行，避免覆盖用户当前已打开页面。
- 不提供“恢复 currentSession”作为主产品能力，避免与跨重启恢复语义冲突。

### 6.7 恢复交互规则

**1. 分级确认策略**

| 快照规模 | 交互方式 |
|---------|---------|
| ≤ 5 个标签页 | 一键恢复，无确认对话框 |
| 6-20 个标签页 | 显示摘要 + 一次确认 |
| > 20 个标签页 | 显示摘要 + 二次确认（防手抖） |

**2. 预览列表设计**

- 点击扩展图标时展开快照预览列表。
- 列表按**浏览器窗口维度**组织统计。
- 窗口项可展开，显示该窗口下的详细标签页列表。
- 相同 URL 在多个窗口中存在时（取决于去重策略）：
  - `strict` 模式：只存一份，`windowId` 为最后打开的窗口
  - `per-window` 模式：每个窗口分别记录
  - `none` 模式：每个标签页独立记录

**3. 浏览器隔离**

- Chrome 扩展只能访问和恢复 Chrome 的快照数据。
- Firefox / Edge 同理，各浏览器数据相互隔离。

**4. 幂等保护**

- 恢复过程中禁用恢复按钮，防止并发恢复。
- 5 分钟内重复恢复同一快照 → 提示"该会话已恢复过，确定再次恢复？"
- 不绝对禁止重复恢复（用户可能故意需要）。

### 6.5 用户界面

- 提供浏览器扩展弹窗页，显示：
  - 最近一次快照摘要
  - 历史快照列表（按窗口维度组织）
  - 恢复按钮
  - 手动立即保存按钮
- 设置页，控制：
  - 快照保留数量
  - 是否在浏览器启动时提示恢复
  - 存储模式配置（SQLite / Remote DB）

### 6.8 浏览器重启后行为

**默认行为**：
- 浏览器启动后不主动弹窗。
- 扩展图标显示角标（如有可恢复快照）。
- 用户点击扩展图标才看到恢复入口。

**可选配置**：
- "启动时提示恢复"：关闭浏览器后超过 N 分钟未关闭的会话，启动时 toast 提示。

### 6.9 currentSession 与 snapshots 边界

**双写模型**：

```
┌─────────────────────────────────────────┐
│ currentSession (单例，实时)              │
│ - 始终反映当前浏览器真实状态             │
│ - 每个事件立即更新                       │
├─────────────────────────────────────────┤
│ snapshots (列表，时间点)                 │
│ - 节流生成：每 5 分钟 or 事件触发         │
│ - 用于历史恢复                           │
└─────────────────────────────────────────┘
```

**浏览器启动补采**：
- 更新 currentSession。
- 不生成新快照（避免覆盖用户之前的快照）。
- 如果检测到 currentSession 与最后快照差异大 → 生成一份"启动时快照"。

### 6.11 摘要与失败提示规则

**采集过滤规则**：

| 类型 | 示例 | 是否采集 | 理由 |
|------|------|---------|------|
| 浏览器内部页 | `chrome://*`, `about:*`, `edge://*` | ❌ 排除 | 无法恢复，无意义 |
| 扩展页面 | `chrome-extension://*`, `moz-extension://*` | ❌ 排除 | 扩展自身页面，外部无法打开 |
| 新标签页 | `about:newtab`, `chrome://newtab` | ❌ 排除 | 空页面，无需恢复 |
| Incognito 窗口 | 所有隐私模式窗口 | ❌ 排除 | 隐私保护，不应落盘 |
| 普通 HTTP/HTTPS | `https://example.com`, `http://*` | ✅ 采集 | 核心场景 |
| 本地文件 | `file:///path/to/file.html` | ⚠️ 可配置 | 默认排除，用户可开启 |
| 特殊协议 | `ftp://`, `data:`, `javascript:` | ❌ 排除 | 非常规浏览场景 |

**处理策略**：

- 采集时过滤：在事件监听阶段就排除不可采集的标签页。
- 恢复时二次校验：即使入库的 URL，恢复前也要再次校验是否可打开。

**UI 提示**：

| 场景 | UI 提示 |
|------|--------|
| 快照中包含已排除的页面 | 不显示（采集时已过滤） |
| 恢复时某个 URL 失败 | 行内提示"1 个标签无法打开" |
| >50% 标签失败 | 快照级警告"大部分标签无法恢复" |

**摘要展示**：
```
摘要内容：
- 创建时间：2026-04-02 14:30
- 2 个窗口，15 个标签页
- 代表性标签（前 3 个）：
  1. GitHub - 项目主页
  2. Google Search - 关键词
  3. Stack Overflow - 问题标题
  ...和 12 个更多
```

**敏感信息**：
- 首版不做脱敏（用户明确知道是本地/自部署）。
- README 明确提示"URL 和标题会明文存储"。

**失败提示**：

| 失败级别 | UI 形式 |
|---------|--------|
| 单个标签恢复失败 | 行内提示："3 个标签无法打开" |
| >50% 标签失败 | 快照级警告："大部分标签无法恢复" |
| 存储写入失败 | Toast（非打扰模式：popup 内红点） |

## 7. 数据与存储设计

### 7.1 存储原则

- 数据默认仅保存在本地（SQLite 模式）。
- 支持用户配置选择远程数据库（PostgreSQL/MySQL）。
- 存储结构简单、可迁移、可调试。
- 业务逻辑与存储实现解耦。

### 7.2 存储架构

采用**存储仓库模式（Repository Pattern）**，分层如下：

```
┌─────────────────────────────────────┐
│       业务逻辑层（SessionService）   │
├─────────────────────────────────────┤
│       存储抽象层（StorageRepository）│
├──────────────────┬──────────────────┤
│  SQLiteAdapter   │  RemoteDbAdapter │
│  (better-sqlite3)│  (PG/MySQL)      │
└──────────────────┴──────────────────┘
```

### 7.3 存储模式对比

| 维度 | SQLite（本地） | PostgreSQL/MySQL（远程） |
|------|---------------|-------------------------|
| 部署复杂度 | 零配置，开箱即用 | 需自部署数据库 |
| 适用场景 | 个人单机使用 | 跨设备同步、多端备份 |
| 网络依赖 | 无需网络 | 需要网络连接 |
| 隐私控制 | 数据完全本地 | 依赖自部署环境信任 |
| 扩展性 | 单设备 | 支持多设备同步 |

### 7.4 用户配置

配置文件 `config.yaml` 或 UI 设置：

```yaml
storage:
  # 存储类型：sqlite | postgresql | mysql
  type: sqlite
  
  # SQLite 配置（type=sqlite 时使用）
  sqlite:
    path: ~/.browser-session/data.db
  
  # PostgreSQL 配置（type=postgresql 时使用）
  postgresql:
    host: localhost
    port: 5432
    database: browser_session
    user: your_user
    password: your_password
    
  # MySQL 配置（type=mysql 时使用）
  mysql:
    host: localhost
    port: 3306
    database: browser_session
    user: your_user
    password: your_password

snapshot:
  # 最大保留快照数量
  maxSnapshots: 20
  # 自动保存间隔（分钟），0 表示仅事件触发
  autoSaveInterval: 5
```

### 7.5 数据表结构

**currentSession 表（实时主数据）**：

```sql
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
  windowId    TEXT NOT NULL UNIQUE,  -- 浏览器窗口 ID
  windowType  TEXT,
  isFocused   BOOLEAN DEFAULT FALSE,
  snapIndex   INTEGER
);

-- 当前标签页表（支持多种去重策略）
CREATE TABLE current_tabs (
  id          TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  windowId    TEXT NOT NULL,         -- 关联 current_windows.windowId
  title       TEXT,
  tabIndex    INTEGER NOT NULL,
  isPinned    BOOLEAN DEFAULT FALSE,
  openedAt    INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL,
  deletedAt   INTEGER                -- 逻辑删除时间
);

-- 去重策略索引（根据配置选择）
-- strict 模式：全局去重
CREATE UNIQUE INDEX idx_current_tabs_strict ON current_tabs(url);

-- per-window 模式：按窗口去重（推荐默认）
CREATE UNIQUE INDEX idx_current_tabs_per_window ON current_tabs(windowId, url);

-- none 模式：无唯一索引，完全不去重
-- （不创建任何唯一索引即可）
```

**snapshots 表（历史归档数据）**：

```sql
-- 快照主表
CREATE TABLE snapshots (
  id          TEXT PRIMARY KEY,
  createdAt   INTEGER NOT NULL,
  windowCount INTEGER NOT NULL,
  tabCount    INTEGER NOT NULL,
  summary     TEXT    -- JSON 格式摘要
);

-- 窗口表
CREATE TABLE windows (
  id          TEXT PRIMARY KEY,
  snapshotId  TEXT NOT NULL,
  windowId    TEXT NOT NULL,
  windowType  TEXT,
  isFocused   BOOLEAN DEFAULT FALSE,
  snapIndex   INTEGER,  -- 窗口在快照中的顺序
  FOREIGN KEY (snapshotId) REFERENCES snapshots(id)
);

-- 标签页表（支持内部删除标记和多种去重策略）
CREATE TABLE tabs (
  id          TEXT PRIMARY KEY,
  snapshotId  TEXT NOT NULL,
  windowId    TEXT NOT NULL,      -- 关联 windows.windowId
  url         TEXT NOT NULL,
  title       TEXT,
  tabIndex    INTEGER NOT NULL,   -- 标签顺序
  isActive    BOOLEAN DEFAULT TRUE,  -- 是否当前打开
  isPinned    BOOLEAN DEFAULT FALSE, -- 是否固定标签
  openedAt    INTEGER NOT NULL,   -- 首次打开时间
  updatedAt   INTEGER NOT NULL,   -- 最后更新时间
  deletedAt   INTEGER,            -- 内部删除标记时间（NULL 表示未删除）
  FOREIGN KEY (snapshotId) REFERENCES snapshots(id)
);

-- 去重策略索引（根据配置选择启用）
-- strict 模式：全局去重
CREATE UNIQUE INDEX idx_tabs_strict ON tabs(snapshotId, url);

-- per-window 模式：按窗口去重
CREATE UNIQUE INDEX idx_tabs_per_window ON tabs(snapshotId, windowId, url);

-- none 模式：无唯一索引
```

**用户配置表**：

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- 存储用户配置
-- dedup.strategy = 'strict' | 'per-window' | 'none'
-- storage.level = 1 | 2 | 3
```

### 7.6 数据操作语义

**存储模式适配**：

```
Level 1 (纯扩展):
  - 使用 chrome.storage.local API
  - 数据以 JSON 形式存储在浏览器 profile 下的扩展本地存储中
  - 浏览器崩溃或系统重启后通常仍会保留
  - 无需 SQL，通过 Repository 层抽象

Level 2 (扩展 + 本地宿主):
  - 通过 Native Messaging 调用本地程序
  - 本地程序操作 SQLite

Level 3 (扩展 + 远程 DB):
  - 通过 Native Messaging 调用本地程序
  - 本地程序操作 PostgreSQL/MySQL
```

**currentSession 操作（实时主数据，以 Level 2/3 为例）**：

```typescript
// 配置：获取当前去重策略
const dedupStrategy = await getConfig('dedup.strategy'); // 'strict' | 'per-window' | 'none'

// 1. 打开标签页 - 更新 currentSession
async function onTabOpened(tab: TabInfo) {
  if (dedupStrategy === 'strict') {
    // 全局去重
    await db.execute(`
      INSERT INTO current_tabs (id, url, windowId, title, tabIndex, isPinned, openedAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        windowId = excluded.windowId,
        title = excluded.title,
        tabIndex = excluded.tabIndex,
        isPinned = excluded.isPinned,
        openedAt = excluded.openedAt,
        updatedAt = excluded.updatedAt,
        deletedAt = NULL
    `);
  } else if (dedupStrategy === 'per-window') {
    // 按窗口去重
    await db.execute(`
      INSERT INTO current_tabs (id, url, windowId, title, tabIndex, isPinned, openedAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(windowId, url) DO UPDATE SET
        title = excluded.title,
        tabIndex = excluded.tabIndex,
        isPinned = excluded.isPinned,
        openedAt = excluded.openedAt,
        updatedAt = excluded.updatedAt,
        deletedAt = NULL
    `);
  } else {
    // none: 完全不去重，总是 INSERT
    await db.execute(`
      INSERT INTO current_tabs (id, url, windowId, title, tabIndex, isPinned, openedAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
}

// 2. 关闭标签页 - 逻辑删除
async function onTabClosed(tabId: string) {
  await db.execute(`
    UPDATE current_tabs
    SET deletedAt = ?, updatedAt = ?
    WHERE id = ?
  `, [Date.now(), Date.now(), tabId]);
}

// 3. 生成快照 - 从 currentSession 复制到 snapshots
async function createSnapshot() {
  const snapshotId = generateId();
  
  // 复制会话元信息
  await db.execute(`INSERT INTO snapshots (...) SELECT ... FROM current_session`);
  
  // 复制窗口
  await db.execute(`INSERT INTO windows (...) SELECT ... FROM current_windows`);
  
  // 复制活跃标签页（根据去重策略）
  if (dedupStrategy === 'none') {
    // 不去重时，每个标签都有独立 id
    await db.execute(`INSERT INTO tabs (...) SELECT ... FROM current_tabs WHERE deletedAt IS NULL`);
  } else {
    // strict/per-window 去重时，只复制唯一记录
    await db.execute(`INSERT INTO tabs (...) SELECT ... FROM current_tabs WHERE deletedAt IS NULL`);
  }
}
```

**snapshots 操作（历史归档）**：

```typescript
// 1. 查询历史快照列表
SELECT id, createdAt, windowCount, tabCount, summary 
FROM snapshots 
ORDER BY createdAt DESC 
LIMIT 20;

// 2. 查询快照详情（按窗口分组）
SELECT w.windowId, w.windowType, t.*
FROM windows w
LEFT JOIN tabs t ON t.windowId = w.windowId AND t.deletedAt IS NULL
WHERE w.snapshotId = ?
ORDER BY w.snapIndex, t.tabIndex;

// 3. 清理过期快照
DELETE FROM snapshots WHERE id NOT IN (
  SELECT id FROM snapshots ORDER BY createdAt DESC LIMIT 20
);
DELETE FROM windows WHERE snapshotId NOT IN (SELECT id FROM snapshots);
DELETE FROM tabs WHERE snapshotId NOT IN (SELECT id FROM snapshots);
```

**Level 1 纯扩展模式存储示例**：

```typescript
// chrome.storage.local 存储结构
{
  "currentSession": {
    "updatedAt": 1712044800000,
    "windows": [...],
    "tabs": [...]
  },
  "snapshots": [
    {
      "id": "snapshot-001",
      "createdAt": 1712044800000,
      "windows": [...],
      "tabs": [...]
    }
  ],
  "settings": {
    "dedup.strategy": "per-window",
    "storage.level": 1
  }
}
```

### 7.7 数据兼容要求

- 为存储结构引入显式 `schemaVersion`。
- 所有快照使用稳定字段名，避免早期频繁重构导致恢复失败。
- 不将运行时临时字段混入持久化结构。
- 支持数据库迁移脚本，schema 升级时自动执行。
- Level 1/2/3 模式切换时，自动迁移数据。

### 7.8 模式升级路径

```
用户安装 → 默认 Level 1（纯扩展）
           ↓ 安装本地宿主程序
        Level 2（本地 SQLite）
           ↓ 配置远程 DB 连接
        Level 3（远程 PostgreSQL/MySQL）
```

**数据迁移**：
- Level 1 → Level 2：导出 chrome.storage.local 数据，导入 SQLite。
- Level 2 → Level 3：导出 SQLite 数据，导入远程 DB。
- Level 3 → Level 2：本地备份，断开远程连接。
- Level 2 → Level 1：警告数据量限制，可能丢失部分历史快照。

## 8. 稳定性要求

- 不把“浏览器是否崩溃”作为恢复前提，只要有最近快照即可恢复。
- 事件丢失时，浏览器启动后的全量重采集可重新校准状态。
- 存储写入失败时，界面中应提供可感知但不过度打扰的失败提示。
- 恢复失败某个标签页时，不应中断整个恢复过程。
- 恢复流程应尽量做到幂等，避免一次点击生成大量重复窗口。

## 9. 实时性要求

- 标签和窗口变化应在短时间内落盘。
- 允许通过短时间节流降低写入频率，但目标是让用户在异常退出前的最近状态尽可能被保留。
- “手动立即保存”必须触发一次完整保存。

## 10. 开源与推广要求

- 项目结构清晰，依赖尽量少。
- 首版优先保证安装简单、功能直接、行为可解释。
- 默认不开启任何云同步和账号系统，以降低用户隐私顾虑。
- README 中应能清楚说明：
  - 工具解决什么问题
  - 与浏览器自动恢复有什么区别
  - 当前支持哪些浏览器
  - Safari 当前为什么未支持
  - 多层次产品形态（Level 1/2/3）
  - URL 去重策略可配置

## 11. 技术设计原则

- 保持实现简单，避免不必要抽象。
- 使用小而清晰的模块边界：
  - 浏览器事件采集
  - 会话建模
  - 快照存储
  - 恢复执行
  - UI 展示
  - 存储适配（Level 1 / Level 2 / Level 3）
- API 保持小且显式。
- 优先选择 Chrome / Edge / Firefox 共通能力。
- 对浏览器差异使用薄适配层，不在业务逻辑中散落兼容分支。
- 存储实现可插拔，业务逻辑不感知具体存储介质。
- Native Messaging 作为 Level 2/3 的通信标准。
- 去重策略可配置，不硬编码单一行为。

## 12. 风险与约束

### 12.1 浏览器能力差异

- 不同浏览器在扩展 API、权限提示、会话恢复细节上存在差异。
- 应尽量以通用 API 为主，差异点收口在适配层。

### 12.2 多层次产品形态风险

| 风险 | Level 1（纯扩展） | Level 2（本地宿主） | Level 3（远程 DB） |
|------|-----------------|-------------------|-------------------|
| 容量限制 | ~5-10MB | 受本地磁盘限制 | 受服务器配置限制 |
| 网络依赖 | 无 | 无 | 需要稳定网络连接 |
| 数据同步 | 单设备 | 单设备 | 多设备（需冲突处理） |
| 部署复杂度 | 零配置 | 需安装宿主程序 | 需自部署数据库 |
| Native Messaging | 不需要 | 需要 | 需要 |

### 12.3 去重策略风险

| 策略 | 风险 | 缓解措施 |
|------|------|---------|
| strict | 用户可能在多个窗口故意打开同一 URL，恢复时丢失窗口结构 | 提供策略切换，用户可随时更改 |
| per-window | 存储量稍大 | 现代存储容量足够，数千标签页仅需 MB 级 |
| none | 存储量最大 | Level 1 模式可能受容量限制 |

### 12.4 敏感信息

- 标签页 URL 可能包含敏感信息。
- Level 1/2 模式：数据完全本地，隐私风险低。
- Level 3 模式：需确保自部署环境安全、传输加密（TLS）。
- 后续若引入云端托管服务，需单独设计隐私提示和权限确认。

### 12.5 Safari 适配风险

- Safari WebExtensions 支持仍在演进中，API 覆盖度可能变化。
- Windows API 限制可能导致窗口恢复精度下降。
- Mac App Store 审核流程可能引入发布延迟。

## 13. 首版验收标准

**核心功能**：
- 在 Chrome / Edge / Firefox 中可安装运行。
- 打开、关闭、移动标签页后，扩展能持续更新最近会话状态。
- 模拟浏览器异常退出后，重新打开浏览器，用户可从扩展中恢复最近会话。
- 恢复结果基本保持原窗口数、标签顺序和 URL 集合。

**存储模式**：
- Level 1（纯扩展）模式可正常工作。
- Level 2（本地宿主）模式可安装并使用 SQLite 存储。
- Level 3（远程 DB）模式支持 PostgreSQL 和 MySQL。
- 三种模式之间可切换，数据可迁移。

**去重策略**：
- 支持 strict / per-window / none 三种策略。
- 用户可通过设置切换策略。
- 默认策略为 per-window。

**其他**：
- 在无网络情况下，核心记录和恢复能力仍可使用（Level 1/2 模式）。

## 14. 后续演进方向

- Safari 支持（需 Xcode 封装 + Mac App Store 发布）。
- 会话导出与导入（JSON/HTML 格式）。
- 浏览器外部备份介质。
- 崩溃后自动提示恢复。
- 会话搜索、过滤、去重和标签分组能力。
- 多设备同步冲突解决策略优化。
- 端到端加密同步（远程数据库模式）。
- Native Messaging 宿主程序（官方提供或社区贡献）。
- 移动端配套 App（iOS/Android）。

## 15. 当前结论

本项目首版定义为一个**多层次、可配置、面向 Chrome / Edge / Firefox** 的扩展工具，用于稳定记录和恢复浏览器会话。

**多层次产品形态**：

| 模式 | 架构 | 适用用户 |
|------|------|---------|
| Level 1 | 纯扩展 + chrome.storage.local | 轻度用户、单设备、零配置 |
| Level 2 | 扩展 + Native Messaging + SQLite | 重度用户、大容量存储需求 |
| Level 3 | 扩展 + Native Messaging + PostgreSQL/MySQL | 跨设备同步、自部署爱好者 |

**可配置策略**：

| 配置项 | 选项 | 默认值 |
|--------|------|--------|
| URL 去重 | strict / per-window / none | per-window |
| 存储模式 | Level 1 / 2 / 3 | Level 1 |

**核心价值** 不是替代浏览器浏览功能，而是在浏览器原生自动恢复失效时，提供一个更可靠、更明确、更可控的会话保存与恢复机制。通过可插拔的存储设计和可配置的去重策略，满足从轻度到重度、从单机到跨设备的多种用户需求。

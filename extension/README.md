# 归屿 TabRescue

归屿 TabRescue 是一款浏览器会话恢复工具，可可靠地保存和恢复您的浏览器会话。

## 功能特性

- 🔄 **实时保存** - 自动监听标签页和窗口变化
- 📸 **手动快照** - 随时创建会话快照
- 🔍 **快照列表** - 浏览历史快照，查看摘要
- ⚡ **一键恢复** - 快速恢复之前的会话
- ⚙️ **可配置策略** - 支持多种 URL 去重策略

## 安装

### 开发模式

1. 克隆项目
2. 进入 `extension` 目录
3. 运行 `npm install` 安装依赖
4. 运行 `npm run build` 构建
5. 在 Chrome 中打开 `chrome://extensions/`
6. 启用"开发者模式"
7. 点击"加载未打包的扩展程序"
8. 选择 `extension/dist` 目录

### 生产模式

从 Chrome Web Store 安装（待发布）。

## 使用指南

### 保存会话

1. 点击扩展图标打开 popup
2. 点击"📸 立即保存"按钮
3. 当前会话将被保存为快照

### 恢复会话

1. 点击扩展图标打开 popup
2. 在快照列表中找到要恢复的快照
3. 点击"恢复"按钮
4. 确认恢复对话框（如果需要）
5. 会话将在新窗口中恢复

### 配置设置

1. 点击扩展图标
2. 点击右上角的 ⚙️ 设置按钮
3. 修改配置：
   - **URL 去重策略**: 严格/按窗口/完全不去重
   - **最大快照数量**: 1-100
   - **自动保存间隔**: 0-60 分钟
   - **数据清理**: 启用/禁用，保留天数
4. 点击"保存"

## 技术架构

### 多层次产品形态

| 模式 | 架构 | 适用用户 |
|------|------|---------|
| Level 1 | 纯扩展 + chrome.storage.local | 轻度用户、零配置 |
| Level 2 | 扩展 + Native Messaging + SQLite | 重度用户、大容量 |
| Level 3 | 扩展 + Native Messaging + PostgreSQL/MySQL | 跨设备同步 |

### URL 去重策略

| 策略 | 行为 |
|------|------|
| strict | 全局唯一，相同 URL 只存一份 |
| per-window | 同一窗口内去重（默认） |
| none | 完全不去重，100% 忠实恢复 |

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 测试
npm test

# Lint
npm run lint
```

## 项目结构

```
extension/
├── public/
│   ├── manifest.json
│   └── icons/
├── src/
│   ├── background/
│   │   ├── index.ts
│   │   ├── EventListener.ts
│   │   └── SessionTracker.ts
│   ├── services/
│   │   ├── SnapshotService.ts
│   │   └── RecoveryService.ts
│   ├── repository/
│   │   ├── types.ts
│   │   └── Level1Repository.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── urlFilter.ts
│   │   └── dedup.ts
│   └── popup/
│       ├── App.tsx
│       ├── index.tsx
│       ├── index.css
│       └── components/
├── package.json
└── tsconfig.json
```

## 支持浏览器

- Chrome 88+
- Edge 88+
- Firefox 90+

## 隐私说明

- 所有数据存储在本地（Level 1 模式）
- 不上传任何个人信息到云端
- 不收集浏览历史记录
- 仅保存用户主动创建的快照

## 常见问题

### Q: 为什么我的标签页没有被保存？
A: 以下类型的标签页不会被保存：
- 隐私模式窗口
- 浏览器内部页面（chrome://, about:）
- 扩展页面
- 新标签页

### Q: 恢复时为什么有些标签页打不开？
A: 部分 URL 可能已失效或被网站阻止。恢复时会跳过无法打开的标签页并显示提示。

### Q: 如何备份我的快照数据？
A: Level 1 模式数据存储在 chrome.storage.local，可通过 Chrome 同步功能备份。Level 2/3 模式直接导出数据库文件。

## License

MIT

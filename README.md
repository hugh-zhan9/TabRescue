# 归屿 TabRescue

> 可靠地保存和恢复您的浏览器会话

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-88+-green.svg)](https://www.google.com/chrome/)
[![Edge](https://img.shields.io/badge/Edge-88+-green.svg)](https://www.microsoft.com/edge/)
[![Firefox](https://img.shields.io/badge/Firefox-90+-orange.svg)](https://www.mozilla.org/firefox/)

## 🌟 简介

**归屿 TabRescue** 是一款浏览器会话恢复工具，专为知识工作者设计。无论是系统崩溃、意外重启，还是单纯想整理混乱的标签页，归屿都能帮助您快速恢复工作状态。

## ✨ 功能特性

- 🔄 **实时保存** - 自动监听标签页和窗口变化，无需手动操作
- 📸 **手动快照** - 随时创建会话快照，重要时刻不错过
- 🔍 **快照列表** - 按窗口维度浏览历史快照，清晰直观
- ⚡ **一键恢复** - 快速恢复之前的会话，支持分级确认
- ⚙️ **灵活配置** - 三种 URL 去重策略，满足不同需求
- 🗄️ **多层存储** - 支持纯扩展、本地 SQLite、远程数据库三种模式
- 🔒 **隐私优先** - 数据默认本地存储，无云端上传

## 🚀 快速开始

### 安装扩展

```bash
# 克隆项目
git clone https://github.com/your-org/tabrescue.git
cd tabrescue/extension

# 安装依赖
npm install

# 构建
npm run build
```

### 加载到浏览器

1. Chrome/Edge: 访问 `chrome://extensions/`，启用开发者模式，加载未打包的扩展程序
2. Firefox: 访问 `about:debugging`，临时载入附加组件

详细安装说明请参考 [INSTALL.md](./INSTALL.md)

### GitHub 自动打包

- `push master` 后会自动跑测试、lint、构建，并上传测试包 artifact
- 发布 GitHub Release 后会自动生成正式安装包 `tabrescue-extension.zip`
- 用户下载 zip 后需要先解压，再在浏览器中加载解压目录

## 📖 使用指南

### 保存会话

1. 点击浏览器工具栏中的归屿图标
2. 点击"📸 立即保存"按钮

### 恢复会话

1. 打开归屿扩展 popup
2. 在快照列表中找到目标快照
3. 点击"恢复"按钮

### 配置策略

1. 点击 popup 右上角的 ⚙️ 设置按钮
2. 调整 URL 去重策略、快照数量等配置
3. 点击"保存"

## 🏗️ 技术架构

### 多层次产品形态

| 模式 | 架构 | 适用场景 |
|------|------|---------|
| Level 1 | 纯扩展 + chrome.storage.local | 轻度用户、零配置 |
| Level 2 | 扩展 + Native Messaging + SQLite | 重度用户、大容量 |
| Level 3 | 扩展 + Native Messaging + PostgreSQL/MySQL | 跨设备同步 |

### URL 去重策略

| 策略 | 行为 | 推荐场景 |
|------|------|---------|
| strict | 全局唯一，相同 URL 只存一份 | 节省存储空间 |
| per-window | 同一窗口内去重（默认） | 平衡存储和准确性 |
| none | 完全不去重 | 100% 忠实恢复 |

## 📦 项目结构

```
tabrescue/
├── extension/           # 浏览器扩展
│   ├── src/
│   │   ├── background/  # Background Service Worker
│   │   ├── services/    # 业务逻辑层
│   │   ├── repository/  # 存储抽象层
│   │   ├── types/       # TypeScript 类型
│   │   ├── utils/       # 工具函数
│   │   └── popup/       # React UI
│   ├── tests/           # 单元测试
│   └── public/
│       ├── manifest.json
│       └── icons/
├── native-host/         # 本地宿主程序
│   ├── src/
│   │   └── storage/     # 存储实现
│   └── scripts/
│       └── install.js   # 安装脚本
├── docs/                # 文档
├── README.md
├── INSTALL.md
└── CHANGELOG.md
```

## 🛠️ 开发

```bash
# 安装所有依赖
npm run install:all

# 构建全部
npm run build:all

# 运行测试
npm run test:all

# 开发模式
npm run dev:extension
```

## 📝 文档

- [安装指南](./INSTALL.md) - 详细的安装步骤
- [实施文档](./docs/IMPLEMENTATION.md) - 技术架构和实现细节
- [需求设计](./docs/2026-04-02-browser-session-recovery-design.md) - 产品需求和设计
- [使用指南](./GUIDE.md) - 功能详解和最佳实践

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](./LICENSE)

## 🙏 致谢

感谢所有为开源社区做出贡献的开发者！

---

**归屿 TabRescue** - 让每一次离开，都能完美归来

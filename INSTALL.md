# TabRescue 安装指南

## 系统要求

- Node.js 18+
- Chrome 88+ / Edge 88+ / Firefox 90+

## 快速安装（Level 1 - 纯扩展模式）

### 步骤 1: 安装依赖

```bash
cd extension
npm install
```

### 步骤 2: 构建扩展

```bash
npm run build
```

### 步骤 3: 加载到浏览器

**Chrome/Edge:**
1. 打开 `chrome://extensions/` (或 `edge://extensions/`)
2. 启用右上角的"开发者模式"
3. 点击"加载未打包的扩展程序"
4. 选择 `extension/dist` 目录
5. 记下扩展 ID（类似 `abcdefghijklmnopqrstuvwxyz123456`）

**Firefox:**
1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击"临时载入附加组件"
3. 选择 `extension/dist/manifest.json`

### 步骤 4: 测试

1. 点击浏览器工具栏中的扩展图标
2. 点击"📸 立即保存"创建快照
3. 关闭一些标签页
4. 点击"恢复"按钮恢复会话

---

## 安装 Level 2 (SQLite 本地存储)

适用于需要更大存储容量的用户。

### 步骤 1: 安装 Native Host 依赖

```bash
cd native-host
npm install
```

### 步骤 2: 构建

```bash
npm run build
```

### 步骤 3: 配置扩展 ID

编辑 `native-host/native-host.json`，将 `__EXTENSION_ID__` 替换为你在第 3 步记下的扩展 ID。

### 步骤 4: 安装 Native Host

```bash
# macOS/Linux
chmod +x scripts/install.js
node scripts/install.js

# Windows
node scripts/install.js
```

### 步骤 5: 配置扩展使用 Level 2

1. 点击扩展图标
2. 点击 ⚙️ 设置
3. 将存储模式改为 Level 2（需要扩展支持，待实现）

---

## 安装 Level 3 (远程数据库)

适用于需要跨设备同步的用户。

### 步骤 1: 准备数据库

**PostgreSQL:**
```sql
CREATE DATABASE tabrescue;
CREATE USER tabrescue_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE tabrescue TO tabrescue_user;
```

**MySQL:**
```sql
CREATE DATABASE tabrescue CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tabrescue_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON tabrescue.* TO 'tabrescue_user'@'localhost';
```

### 步骤 2: 配置环境变量

```bash
export STORAGE_TYPE=postgresql
export PG_HOST=localhost
export PG_PORT=5432
export PG_DATABASE=tabrescue
export PG_USER=tabrescue_user
export PG_PASSWORD=your_password
```

### 步骤 3: 启动 Native Host

```bash
cd native-host
npm run build
npm start
```

---

## 故障排除

### 问题：扩展无法加载

**解决方案:**
1. 确保已运行 `npm run build`
2. 检查 `dist` 目录是否存在
3. 查看 `chrome://extensions/` 中的错误信息

### 问题：Native Host 无法连接

**解决方案:**
1. 确保扩展 ID 已正确配置在 `native-host.json` 中
2. 检查 Native Host 是否在运行
3. 查看浏览器控制台日志

### 问题：数据未保存

**解决方案:**
1. Level 1: 检查 chrome.storage.local 容量（默认 5-10MB）
2. Level 2: 检查 `~/.tabrescue/data.db` 文件是否存在
3. Level 3: 检查数据库连接

---

## 卸载

### 卸载扩展

1. 打开 `chrome://extensions/`
2. 找到 TabRescue
3. 点击"移除"

### 卸载 Native Host

```bash
# macOS
rm -rf ~/.tabrescue
rm ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.tabrescue.native-host.json
rm ~/Library/Application\ Support/Microsoft\ Edge/NativeMessagingHosts/com.tabrescue.native-host.json

# Linux
rm -rf ~/.tabrescue
rm ~/.config/google-chrome/NativeMessagingHosts/com.tabrescue.native-host.json

# Windows
rmdir %APPDATA%\..\Local\Google\Chrome\User Data\NativeMessagingHosts\com.tabrescue.native-host.json
```

---

## 获取帮助

- 查看 [README.md](./README.md)
- 查看 [IMPLEMENTATION.md](./docs/IMPLEMENTATION.md)
- 提交 Issue

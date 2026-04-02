#!/usr/bin/env node

/**
 * Native Host 安装脚本
 * 将 native-host.json 注册到浏览器
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir, platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 配置
const HOST_NAME = 'com.tabrescue.native_host';
const MANIFEST_PATH = join(__dirname, '..', 'native-host.json');
const HOST_ENTRY_PATH = join(__dirname, '..', 'dist', 'index.js');
const WRAPPER_PATH = join(__dirname, '..', 'dist', 'run-native-host');

// 不同浏览器的manifest 路径
const BROWSER_PATHS = {
  chrome: {
    darwin: join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'),
    linux: join(homedir(), '.config', 'google-chrome', 'NativeMessagingHosts'),
    win32: join(homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'NativeMessagingHosts'),
  },
  edge: {
    darwin: join(homedir(), 'Library', 'Application Support', 'Microsoft Edge', 'NativeMessagingHosts'),
    linux: join(homedir(), '.config', 'microsoft-edge', 'NativeMessagingHosts'),
    win32: join(homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'NativeMessagingHosts'),
  },
  firefox: {
    darwin: join(homedir(), 'Library', 'Application Support', 'Mozilla', 'Firefox', 'Profiles'),
    linux: join(homedir(), '.mozilla', 'native-messaging-hosts'),
    win32: join(homedir(), 'AppData', 'Roaming', 'Mozilla', 'Firefox', 'Profiles'),
  },
};

function getNativeMessagingDir(browser) {
  const plat = platform();
  const paths = BROWSER_PATHS[browser];
  if (!paths) throw new Error(`Unknown browser: ${browser}`);
  return paths[plat];
}

function getExtensionIds() {
  const arg = process.argv.find((item) => item.startsWith('--extension-id='));
  const raw = arg?.split('=')[1] || process.env.TABRESCUE_EXTENSION_ID || '';
  const ids = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    throw new Error(
      'Missing extension ID. Run `node scripts/install.js --extension-id=<your-extension-id>`.'
    );
  }

  return ids;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function createWrapper() {
  if (!existsSync(HOST_ENTRY_PATH)) {
    throw new Error(`Native host entry not found: ${HOST_ENTRY_PATH}`);
  }

  const nodePath = process.execPath;
  const script = [
    '#!/bin/sh',
    `exec ${shellQuote(nodePath)} ${shellQuote(HOST_ENTRY_PATH)} "$@"`,
    '',
  ].join('\n');

  writeFileSync(WRAPPER_PATH, script, 'utf-8');
  chmodSync(WRAPPER_PATH, 0o755);

  return WRAPPER_PATH;
}

function install() {
  console.log('Installing TabRescue Native Host...');
  const extensionIds = getExtensionIds();
  const executablePath = createWrapper();

  // 读取 manifest
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  manifest.path = executablePath;
  manifest.allowed_origins = extensionIds.map((id) => `chrome-extension://${id}/`);

  // 创建目录
  const chromeDir = getNativeMessagingDir('chrome');
  const edgeDir = getNativeMessagingDir('edge');

  [chromeDir, edgeDir].forEach(dir => {
    try {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const manifestPath = join(dir, `${HOST_NAME}.json`);
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      chmodSync(manifestPath, 0o644);
      console.log(`✓ Installed to ${dir}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`✗ Failed to install to ${dir}: ${message}`);
    }
  });

  console.log('\nInstallation complete!');
  console.log(`Executable: ${executablePath}`);
  console.log(`Allowed origins: ${manifest.allowed_origins.join(', ')}`);
}

install();

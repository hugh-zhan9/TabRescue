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
const EXTENSION_ID = 'YOUR_EXTENSION_ID'; // 安装后替换
const HOST_NAME = 'com.tabrescue.native-host';
const MANIFEST_PATH = join(__dirname, '..', 'native-host.json');
const EXECUTABLE_PATH = join(__dirname, '..', 'dist', 'index.js');

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

function getNativeMessagingDir(browser: string): string {
  const plat = platform();
  const paths = BROWSER_PATHS[browser as keyof typeof BROWSER_PATHS];
  if (!paths) throw new Error(`Unknown browser: ${browser}`);
  return paths[plat as keyof typeof paths] as string;
}

function install() {
  console.log('Installing TabRescue Native Host...');

  // 读取 manifest
  let manifest = readFileSync(MANIFEST_PATH, 'utf-8');
  manifest = manifest.replace('__INSTALL_PATH__', EXECUTABLE_PATH);
  manifest = manifest.replace('__EXTENSION_ID__', EXTENSION_ID);

  // 创建目录
  const chromeDir = getNativeMessagingDir('chrome');
  const edgeDir = getNativeMessagingDir('edge');

  [chromeDir, edgeDir].forEach(dir => {
    try {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const manifestPath = join(dir, `${HOST_NAME}.json`);
      writeFileSync(manifestPath, manifest);
      chmodSync(manifestPath, 0o644);
      console.log(`✓ Installed to ${dir}`);
    } catch (err) {
      console.error(`✗ Failed to install to ${dir}: ${(err as Error).message}`);
    }
  });

  console.log('\nInstallation complete!');
  console.log(`Executable: ${EXECUTABLE_PATH}`);
  console.log('\nNote: Make sure to replace YOUR_EXTENSION_ID in native-host.json with your actual extension ID');
}

install();

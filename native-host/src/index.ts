#!/usr/bin/env node

/**
 * TabRescue Native Host
 * 通过 stdin/stdout 与浏览器扩展通信
 */

import { stdin, stdout } from 'process';
import { StorageManager } from './storage/StorageManager.js';
import { getNativeHostLogPath, logNativeHost } from './logger.js';

const storageManager = new StorageManager();
let shuttingDown = false;

// 读取消息的缓冲区
let buffer = Buffer.alloc(0);
let expectedLength = -1;

// 读取消息（Native Messaging 协议：4 字节长度 + JSON）
async function readMessage(): Promise<any | null> {
  return new Promise((resolve) => {
    if (expectedLength === -1) {
      // 需要先读取 4 字节长度
      if (buffer.length >= 4) {
        const length = buffer.readUInt32LE(0);
        expectedLength = length;
        buffer = buffer.slice(4);
      } else {
        resolve(null);
        return;
      }
    }

    // 检查是否有足够的數據
    if (buffer.length >= expectedLength) {
      const messageData = buffer.slice(0, expectedLength);
      buffer = buffer.slice(expectedLength);
      expectedLength = -1;

      try {
        const message = JSON.parse(messageData.toString('utf8'));
        resolve(message);
      } catch (err) {
        console.error('[NativeHost] Parse error:', err);
        logNativeHost('parse_error', err);
        resolve(null);
      }
    } else {
      resolve(null);
    }
  });
}

// 处理消息
function processData(data: Buffer) {
  buffer = Buffer.concat([buffer, data]);

  // 尝试解析消息
  setImmediate(async () => {
    while (true) {
      const message = await readMessage();
      if (message) {
        await handleCommand(message);
        await shutdownHost(0);
        return;
      } else {
        break;
      }
    }
  });
}

// 发送响应
function sendResponse(response: any): Promise<void> {
  const messageBuffer = Buffer.from(JSON.stringify(response), 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

  return new Promise((resolve, reject) => {
    stdout.write(lengthBuffer, (lengthError) => {
      if (lengthError) {
        reject(lengthError);
        return;
      }

      stdout.write(messageBuffer, (messageError) => {
        if (messageError) {
          reject(messageError);
          return;
        }

        resolve();
      });
    });
  });
}

async function shutdownHost(code: number) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  try {
    await storageManager.shutdown();
    logNativeHost('shutdown_complete', { code });
  } catch (error) {
    logNativeHost('shutdown_error', error);
  }

  stdout.end(() => {
    process.exit(code);
  });
}

// 处理命令
async function handleCommand(command: any) {
  const { action, params, context } = command;
  storageManager.setBrowserScope(context?.browserScope);
  logNativeHost('handle_command', {
    action,
    context,
    storage: params?.settings?.storage
      ? {
          level: params.settings.storage.level,
          remoteType: params.settings.storage.remoteType,
          sqlitePath: params.settings.storage.sqlite?.path || null,
          postgresql: params.settings.storage.postgresql
            ? {
                host: params.settings.storage.postgresql.host,
                port: params.settings.storage.postgresql.port,
                database: params.settings.storage.postgresql.database,
                user: params.settings.storage.postgresql.user,
                ssl: params.settings.storage.postgresql.ssl || false,
              }
            : undefined,
          mysql: params.settings.storage.mysql
            ? {
                host: params.settings.storage.mysql.host,
                port: params.settings.storage.mysql.port,
                database: params.settings.storage.mysql.database,
                user: params.settings.storage.mysql.user,
                ssl: params.settings.storage.mysql.ssl || false,
              }
            : undefined,
        }
      : undefined,
  });

  try {
    let result;

    switch (action) {
      case 'get_snapshots':
        result = await storageManager.getSnapshots(params.limit);
        break;

      case 'get_snapshot_detail':
        result = await storageManager.getSnapshotDetail(params.id);
        break;

      case 'save_snapshot':
        await storageManager.saveSnapshot(params.snapshot);
        result = { success: true };
        break;

      case 'delete_snapshot':
        await storageManager.deleteSnapshot(params.id);
        result = { success: true };
        break;

      case 'get_settings':
        result = await storageManager.getSettings();
        break;

      case 'get_popup_state':
        result = await storageManager.getPopupState(params.limit);
        break;

      case 'save_settings':
        await storageManager.saveSettings(params.settings);
        result = { success: true };
        break;

      case 'cleanup_deleted_tabs':
        await storageManager.cleanupDeletedTabs(params.retentionDays);
        result = { success: true };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    await sendResponse({ action, success: true, data: result });
    logNativeHost('handle_command_success', { action });
  } catch (error) {
    logNativeHost('handle_command_error', {
      action,
      error,
    });
    await sendResponse({
      action,
      success: false,
      error: (error as Error).message,
    });
  }
}

// 主循环
async function main() {
  console.error('[NativeHost] Starting...');
  logNativeHost('starting', { logPath: getNativeHostLogPath() });

  // 初始化存储
  await storageManager.initialize();

  // 监听 stdin 数据
  stdin.on('data', (data: Buffer) => {
    processData(data);
  });

  stdin.on('end', () => {
    console.error('[NativeHost] Connection closed');
    logNativeHost('connection_closed');
    void shutdownHost(0);
  });

  stdin.on('error', (err) => {
    console.error('[NativeHost] stdin error:', err);
    logNativeHost('stdin_error', err);
    void shutdownHost(1);
  });

  console.error('[NativeHost] Ready');
  logNativeHost('ready');
}

main().catch((error) => {
  logNativeHost('fatal_error', error);
  console.error(error);
});

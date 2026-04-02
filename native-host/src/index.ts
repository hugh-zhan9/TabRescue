#!/usr/bin/env node

/**
 * TabRescue Native Host
 * 通过 stdin/stdout 与浏览器扩展通信
 */

import { stdin, stdout } from 'process';
import { StorageManager } from './storage/StorageManager.js';

const storageManager = new StorageManager();

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
      } else {
        break;
      }
    }
  });
}

// 发送响应
function sendResponse(response: any) {
  const messageBuffer = Buffer.from(JSON.stringify(response), 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

  stdout.write(lengthBuffer);
  stdout.write(messageBuffer);
}

// 处理命令
async function handleCommand(command: any) {
  const { action, params } = command;

  try {
    let result;

    switch (action) {
      case 'get_current_session':
        result = await storageManager.getCurrentSession();
        break;

      case 'save_current_session':
        await storageManager.saveCurrentSession(params.session);
        result = { success: true };
        break;

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

    sendResponse({ action, success: true, data: result });
  } catch (error) {
    sendResponse({
      action,
      success: false,
      error: (error as Error).message,
    });
  }
}

// 主循环
async function main() {
  console.error('[NativeHost] Starting...');

  // 初始化存储
  await storageManager.initialize();

  // 监听 stdin 数据
  stdin.on('data', (data: Buffer) => {
    processData(data);
  });

  stdin.on('end', () => {
    console.error('[NativeHost] Connection closed');
    process.exit(0);
  });

  stdin.on('error', (err) => {
    console.error('[NativeHost] stdin error:', err);
    process.exit(1);
  });

  console.error('[NativeHost] Ready');
}

main().catch(console.error);

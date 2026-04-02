/**
 * Background Service Worker 入口
 */
import { EventListener } from './EventListener';
import { SessionTracker } from './SessionTracker';
import { SnapshotService } from '../services/SnapshotService';
import { RecoveryService } from '../services/RecoveryService';
import { Level1Repository } from '../repository/Level1Repository';
import { NativeRepository } from '../repository/NativeRepository';
import { StorageRepository } from '../repository/types';
import { StorageLevel } from '../types';
import type {
  BackgroundRequest,
  GetSnapshotsResponse,
  GetSnapshotDetailResponse,
  CreateSnapshotResponse,
  RestoreSnapshotResponse,
  GetSettingsResponse,
  SaveSettingsResponse,
  GetCurrentSessionResponse,
  GetRecoveryProgressResponse,
} from '../shared/messages';

// 服务实例（初始化后保持单例）
let repository: StorageRepository;
let eventListener: EventListener;
let recoveryService: RecoveryService;
let snapshotService: SnapshotService;
let tracker: SessionTracker;
const bootstrapRepository = new Level1Repository();

// 初始化 Promise，确保所有消息处理都等待初始化完成
let initPromise: Promise<void>;

// 异步初始化仓库（根据 storage.level 选择实现）
async function initRepository(): Promise<StorageRepository> {
  try {
    const settings = await bootstrapRepository.getSettings();
    const level = settings.storage?.level || 1;
    return createRepository(level as StorageLevel);
  } catch {
    // 使用默认 Level 1
  }
  return bootstrapRepository;
}

function createRepository(level: StorageLevel): StorageRepository {
  if (level >= 2) {
    return new NativeRepository(level);
  }
  return bootstrapRepository;
}

function wireRuntimeServices(nextRepository: StorageRepository) {
  repository = nextRepository;

  snapshotService = new SnapshotService(repository);
  recoveryService = new RecoveryService(repository);

  tracker = new SessionTracker(repository);

  if (eventListener) {
    eventListener.setTracker(tracker);
    eventListener.setSnapshotService(snapshotService);
  }
}

// 异步初始化所有服务
async function initialize(): Promise<void> {
  const initialRepository = await initRepository();
  wireRuntimeServices(initialRepository);
  eventListener = new EventListener(tracker, snapshotService);
  await eventListener.setup();

  // setup 完成后立即采集当前 session（onInstalled 事件可能已错过）
  await tracker.fullCapture();

  console.log(`[TabRescue] 归屿 initialized (Level ${repository.getStorageLevel()})`);
}

initPromise = initialize().catch((err) => {
  console.error('[TabRescue] Initialization failed:', err);
  throw err; // 不要吞掉错误，让 initPromise 保持 rejected 状态
});

// 处理来自 Popup 的消息
chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
  initPromise.then(() => {
    handleMessage(message, sendResponse);
  }).catch((err: Error) => {
    sendResponse({ success: false, error: `初始化失败: ${err.message}` });
  });
  return true;
});

async function handleMessage(
  message: BackgroundRequest,
  sendResponse: (response: unknown) => void
) {
  try {
    switch (message.action) {
      case 'getSnapshots': {
        const snapshots = await snapshotService.getSnapshots(message.limit);
        const response: GetSnapshotsResponse = { success: true, data: snapshots };
        sendResponse(response);
        break;
      }
      case 'getSnapshotDetail': {
        const detail = await snapshotService.getSnapshotDetail(message.id);
        const response: GetSnapshotDetailResponse = { success: true, data: detail };
        sendResponse(response);
        break;
      }
      case 'createSnapshot': {
        const snapshot = await snapshotService.createSnapshot();
        const response: CreateSnapshotResponse = { success: true, data: snapshot };
        sendResponse(response);
        break;
      }
      case 'restoreSnapshot': {
        const result = await recoveryService.restoreSnapshot(message.snapshotId, message.options);
        const response: RestoreSnapshotResponse = { success: true, data: result };
        sendResponse(response);
        break;
      }
      case 'getSettings': {
        const settings = await repository.getSettings();
        const response: GetSettingsResponse = { success: true, data: settings };
        sendResponse(response);
        break;
      }
      case 'saveSettings': {
        const nextLevel = message.settings.storage?.level ?? 1;
        const nextRepository = createRepository(nextLevel as StorageLevel);

        await nextRepository.saveSettings(message.settings);
        if (nextRepository !== bootstrapRepository) {
          await bootstrapRepository.saveSettings(message.settings);
        }

        if (repository.getStorageLevel() !== nextRepository.getStorageLevel()) {
          wireRuntimeServices(nextRepository);
          await tracker.fullCapture();
        }

        // 更新自动保存间隔
        const newInterval = message.settings.snapshot?.autoSaveInterval ?? 5;
        await eventListener?.updateAutoSaveInterval(newInterval);
        const response: SaveSettingsResponse = { success: true };
        sendResponse(response);
        break;
      }
      case 'getCurrentSession': {
        const session = await repository.getCurrentSession();
        const response: GetCurrentSessionResponse = { success: true, data: session };
        sendResponse(response);
        break;
      }
      case 'syncCurrentSession': {
        await tracker.fullCapture();
        const session = await repository.getCurrentSession();
        const response: GetCurrentSessionResponse = { success: true, data: session };
        sendResponse(response);
        break;
      }
      case 'getRecoveryProgress': {
        const progress = recoveryService.getRecoveryProgress();
        const response: GetRecoveryProgressResponse = { success: true, data: progress };
        sendResponse(response);
        break;
      }
      default: {
        const response = { success: false, error: 'Unknown action' };
        sendResponse(response);
        break;
      }
    }
  } catch (error) {
    const response = { success: false, error: (error as Error).message };
    sendResponse(response);
  }
}

import { SessionTracker } from './SessionTracker';
import { SnapshotService } from '../services/SnapshotService';
import { shouldCollect } from '../utils/urlFilter';

/**
 * 浏览器事件监听器
 * 负责监听标签页和窗口的各种事件
 */
export class EventListener {
  private tracker: SessionTracker;
  private snapshotService: SnapshotService;
  private closingWindowSnapshotAttempted = new Set<number>();
  private readonly ensureInitialized: () => Promise<void>;
  private eventSnapshotInFlight: Promise<void> | null = null;
  private pendingEventSnapshot = false;

  constructor(
    tracker: SessionTracker,
    snapshotService: SnapshotService,
    ensureInitialized: () => Promise<void> = async () => {}
  ) {
    this.tracker = tracker;
    this.snapshotService = snapshotService;
    this.ensureInitialized = ensureInitialized;
  }

  public setTracker(tracker: SessionTracker) {
    this.tracker = tracker;
  }

  public setSnapshotService(snapshotService: SnapshotService) {
    this.snapshotService = snapshotService;
  }

  /**
   * 更新自动保存间隔
   */
  public async updateAutoSaveInterval(interval: number) {
    // 清除旧的 alarm
    await chrome.alarms.clear('snapshot');

    // 创建新的 alarm
    if (interval > 0) {
      chrome.alarms.create('snapshot', { periodInMinutes: interval });
    }
  }

  public setup() {
    this.setupTabListeners();
    this.setupWindowListeners();
    this.setupRuntimeListeners();
  }

  public async refreshAutoSaveInterval() {
    const settings = await this.tracker.getSettings();
    const interval = settings.snapshot?.autoSaveInterval ?? 5;
    await this.updateAutoSaveInterval(interval);
  }

  private async runWhenReady(action: () => Promise<void>) {
    await this.ensureInitialized();
    await action();
  }

  private requestEventSnapshot() {
    this.pendingEventSnapshot = true;

    if (this.eventSnapshotInFlight) {
      return;
    }

    this.eventSnapshotInFlight = this.runEventSnapshotLoop().finally(() => {
      this.eventSnapshotInFlight = null;
    });
  }

  private async runEventSnapshotLoop() {
    while (this.pendingEventSnapshot) {
      this.pendingEventSnapshot = false;
      await this.runWhenReady(async () => {
        try {
          await this.snapshotService.createSnapshot();
        } catch {
          // 事件快照只做 best-effort
        }
      });
    }
  }

  private setupTabListeners() {
    // 标签页创建
    chrome.tabs.onCreated.addListener(async (tab) => {
      await this.runWhenReady(async () => {
        if (!tab.id) return;
        if (shouldCollect(tab)) {
          await this.tracker.onTabCreated(tab);
          this.requestEventSnapshot();
        }
      });
    });

    // 标签页关闭
    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
      await this.runWhenReady(async () => {
        let capturedBeforeWindowClose = false;
        if (
          removeInfo.isWindowClosing &&
          !this.closingWindowSnapshotAttempted.has(removeInfo.windowId) &&
          await this.tracker.isLastTrackedWindow(removeInfo.windowId)
        ) {
          this.closingWindowSnapshotAttempted.add(removeInfo.windowId);
          capturedBeforeWindowClose = true;
          try {
            await this.snapshotService.createSnapshot();
          } catch {
            // 浏览器退出阶段只做 best-effort
          }
        }

        await this.tracker.onTabClosed(tabId, removeInfo.windowId);
        if (!capturedBeforeWindowClose) {
          this.requestEventSnapshot();
        }
      });
    });

    // 标签页更新
    chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
      await this.runWhenReady(async () => {
        if (!tab.id) return;
        if (shouldCollect(tab) && (changeInfo.url || changeInfo.title)) {
          await this.tracker.onTabUpdated(tab);
          if (changeInfo.url) {
            this.requestEventSnapshot();
          }
        }
      });
    });

    // 标签页移动
    chrome.tabs.onMoved.addListener(async (_tabId, moveInfo) => {
      await this.runWhenReady(async () => {
        await this.tracker.onTabMoved(moveInfo);
        this.requestEventSnapshot();
      });
    });

    // 标签页激活
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      await this.runWhenReady(async () => {
        await this.tracker.onTabActivated(activeInfo);
      });
    });
  }

  private setupWindowListeners() {
    // 窗口创建
    chrome.windows.onCreated.addListener(async (window) => {
      await this.runWhenReady(async () => {
        await this.tracker.onWindowCreated(window);
        this.requestEventSnapshot();
      });
    });

    // 窗口关闭
    chrome.windows.onRemoved.addListener(async (windowId) => {
      await this.runWhenReady(async () => {
        this.closingWindowSnapshotAttempted.delete(windowId);
        await this.tracker.onWindowClosed(windowId);
        this.requestEventSnapshot();
      });
    });

    // 窗口聚焦变化
    chrome.windows.onFocusChanged.addListener(async (windowId) => {
      await this.runWhenReady(async () => {
        await this.tracker.onWindowFocused(windowId);
      });
    });
  }

  private setupRuntimeListeners() {
    // 扩展安装/更新/重载时都初始化 session
    chrome.runtime.onInstalled.addListener(async (details) => {
      await this.runWhenReady(async () => {
        if (details.reason === 'install' || details.reason === 'update') {
          await this.tracker.initialize();
        }
      });
    });

    // 浏览器启动
    chrome.runtime.onStartup.addListener(async () => {
      await this.runWhenReady(async () => {
        await this.tracker.fullCapture();
      });
    });

    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'snapshot') {
        await this.runWhenReady(async () => {
          try {
            await this.snapshotService.createSnapshot({ refreshCurrentState: true });
          } catch {
            // 后台定时保存只做 best-effort
          }
        });
      }
    });

    void this.refreshAutoSaveInterval();
  }
}

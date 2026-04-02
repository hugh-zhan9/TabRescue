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

  constructor(tracker: SessionTracker, snapshotService: SnapshotService) {
    this.tracker = tracker;
    this.snapshotService = snapshotService;
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

  public async setup() {
    this.setupTabListeners();
    this.setupWindowListeners();
    await this.setupRuntimeListeners();
  }

  private setupTabListeners() {
    // 标签页创建
    chrome.tabs.onCreated.addListener(async (tab) => {
      if (!tab.id) return;
      if (shouldCollect(tab)) {
        await this.tracker.onTabCreated(tab);
      }
    });

    // 标签页关闭
    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
      if (
        removeInfo.isWindowClosing &&
        !this.closingWindowSnapshotAttempted.has(removeInfo.windowId) &&
        await this.tracker.isLastTrackedWindow(removeInfo.windowId)
      ) {
        this.closingWindowSnapshotAttempted.add(removeInfo.windowId);
        try {
          await this.snapshotService.createSnapshot();
        } catch {
          // 浏览器退出阶段只做 best-effort
        }
      }
      await this.tracker.onTabClosed(tabId, removeInfo.windowId);
    });

    // 标签页更新
    chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
      if (!tab.id) return;
      if (shouldCollect(tab) && (changeInfo.url || changeInfo.title)) {
        await this.tracker.onTabUpdated(tab);
      }
    });

    // 标签页移动
    chrome.tabs.onMoved.addListener(async (_tabId, moveInfo) => {
      await this.tracker.onTabMoved(moveInfo);
    });

    // 标签页激活
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      await this.tracker.onTabActivated(activeInfo);
    });
  }

  private setupWindowListeners() {
    // 窗口创建
    chrome.windows.onCreated.addListener(async (window) => {
      await this.tracker.onWindowCreated(window);
    });

    // 窗口关闭
    chrome.windows.onRemoved.addListener(async (windowId) => {
      this.closingWindowSnapshotAttempted.delete(windowId);
      await this.tracker.onWindowClosed(windowId);
    });

    // 窗口聚焦变化
    chrome.windows.onFocusChanged.addListener(async (windowId) => {
      await this.tracker.onWindowFocused(windowId);
    });
  }

  private async setupRuntimeListeners() {
    // 扩展安装/更新/重载时都初始化 session
    chrome.runtime.onInstalled.addListener(async (details) => {
      if (details.reason === 'install' || details.reason === 'update') {
        await this.tracker.initialize();
      }
    });

    // 浏览器启动
    chrome.runtime.onStartup.addListener(async () => {
      await this.tracker.fullCapture();
    });

    // 读取设置以配置自动保存间隔（使用 ?? 保留 0 值）
    const settings = await this.tracker.getSettings();
    const interval = settings.snapshot?.autoSaveInterval ?? 5;

    // 始终注册 alarm listener
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'snapshot') {
        try {
          await this.snapshotService.createSnapshot();
        } catch {
          // 后台定时保存只做 best-effort
        }
      }
    });

    // 定时快照（使用 alarms API）
    if (interval > 0) {
      chrome.alarms.create('snapshot', { periodInMinutes: interval });
    }
  }
}

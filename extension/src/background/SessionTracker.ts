import { CurrentSession, TabData, WindowData, Settings } from '../types';
import { StorageRepository } from '../repository/types';
import { findTabIndexByKey } from '../utils/dedup';
import { shouldCollect } from '../utils/urlFilter';

/**
 * 会话追踪器
 * 负责维护当前会话状态，处理标签页和窗口变化
 */
export class SessionTracker {
  private repository: StorageRepository;
  // 维护 browser tabId 到 TabData 的映射（运行时）
  private tabIdMap = new Map<number, TabData>();

  constructor(repository: StorageRepository) {
    this.repository = repository;
  }

  private getDefaultSettings(): Settings {
    return {
      dedup: { strategy: 'per-window' },
      storage: { level: 1 },
      snapshot: { maxSnapshots: 20, autoSaveInterval: 5 },
      ui: { showRecoveryPromptOnStartup: false },
    };
  }

  /**
   * 初始化
   */
  public async initialize() {
    // 浏览器启动时补采当前状态
    await this.fullCapture();
  }

  /**
   * 获取当前设置
   */
  public async getSettings(): Promise<Settings> {
    const savedSettings = await this.repository.getSettings();
    return { ...this.getDefaultSettings(), ...savedSettings };
  }

  /**
   * 全量采集当前浏览器状态
   */
  public async fullCapture() {
    const windows = await chrome.windows.getAll({ populate: true });

    const sessionWindows: WindowData[] = windows.map((w, idx) => ({
      windowId: w.id!.toString(),
      windowType: w.type || 'normal',
      isFocused: w.focused || false,
      snapIndex: idx,
    }));

    const sessionTabs: TabData[] = [];
    for (const win of windows) {
      for (const tab of win.tabs || []) {
        if (shouldCollect(tab)) {
          const tabData: TabData = {
            url: tab.url!,
            windowId: win.id!.toString(),
            title: tab.title,
            tabIndex: tab.index,
            isPinned: tab.pinned || false,
            openedAt: Date.now(),
            updatedAt: Date.now(),
            deletedAt: null,
          };
          sessionTabs.push(tabData);
          // 更新 tabId 映射
          if (tab.id) {
            this.tabIdMap.set(tab.id, tabData);
          }
        }
      }
    }

    const currentSession: CurrentSession = {
      id: 'singleton',
      updatedAt: Date.now(),
      windows: sessionWindows,
      tabs: sessionTabs,
    };

    await this.repository.saveCurrentSession(currentSession);
  }

  public async isLastTrackedWindow(windowId: number): Promise<boolean> {
    const session = await this.repository.getCurrentSession();
    if (!session) return false;

    const normalWindows = session.windows.filter((window) => window.windowType === 'normal');
    return normalWindows.length === 1 && normalWindows[0].windowId === windowId.toString();
  }

  /**
   * 标签页创建
   */
  public async onTabCreated(tab: chrome.tabs.Tab) {
    if (!tab.url || !tab.windowId) return;

    const session = await this.repository.getCurrentSession();
    if (!session) return;

    // 每次事件都从 storage 读取最新设置
    const savedSettings = await this.repository.getSettings();
    const settings = { ...this.getDefaultSettings(), ...savedSettings };

    const { strategy } = settings.dedup;
    const windowId = tab.windowId.toString();
    const existingIndex = findTabIndexByKey(
      session.tabs,
      tab.url,
      windowId,
      strategy
    );

    if (existingIndex >= 0) {
      // UPSERT - 更新现有记录，同时恢复被删除的标签页
      session.tabs[existingIndex].windowId = windowId;
      session.tabs[existingIndex].updatedAt = Date.now();
      session.tabs[existingIndex].deletedAt = null;
      // 更新 tabId 映射
      if (tab.id) {
        this.tabIdMap.set(tab.id, session.tabs[existingIndex]);
      }
    } else {
      // INSERT - 新增记录
      const tabData: TabData = {
        url: tab.url,
        windowId: windowId,
        title: tab.title,
        tabIndex: tab.index || 0,
        isPinned: tab.pinned || false,
        openedAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      };
      session.tabs.push(tabData);
      // 更新 tabId 映射
      if (tab.id) {
        this.tabIdMap.set(tab.id, tabData);
      }
    }

    session.updatedAt = Date.now();
    await this.repository.saveCurrentSession(session);
  }

  /**
   * 标签页关闭
   */
  public async onTabClosed(tabId: number, _windowId: number) {
    const session = await this.repository.getCurrentSession();
    if (!session) return;

    // 如果 tabIdMap 为空（worker 重启后），先重建映射
    if (this.tabIdMap.size === 0) {
      await this.rebuildTabIdMap();
    }

    // 尝试通过 tabId 找到对应的标签页
    const tabData = this.tabIdMap.get(tabId);
    if (tabData) {
      // 找到对应的标签页，逻辑删除
      const sessionTab = session.tabs.find(
        (t) => t.url === tabData.url && t.windowId === tabData.windowId && !t.deletedAt
      );
      if (sessionTab) {
        sessionTab.deletedAt = Date.now();
      }
      this.tabIdMap.delete(tabId);
    } else {
      // tabId 不在映射中，无法可靠地确定是哪个标签页被关闭
      // 跳过删除，避免误删。下次全量采集时会校准。
    }

    session.updatedAt = Date.now();
    await this.repository.saveCurrentSession(session);
  }

  /**
   * 重建 tabIdMap（用于 worker 重启后恢复）
   */
  private async rebuildTabIdMap() {
    try {
      // 使用 chrome.tabs.query 获取所有当前活动的标签页
      const tabs = await chrome.tabs.query({});
      const session = await this.repository.getCurrentSession();
      if (!session) return;

      for (const tab of tabs) {
        if (tab.id && tab.url && shouldCollect(tab)) {
          const existingTab = session.tabs.find(
            (t) => t.url === tab.url && t.windowId === tab.windowId!.toString() && !t.deletedAt
          );
          if (existingTab) {
            this.tabIdMap.set(tab.id, existingTab);
          }
        }
      }
    } catch (err) {
      console.error('[SessionTracker] Failed to rebuild tabIdMap:', err);
    }
  }

  /**
   * 标签页更新
   */
  public async onTabUpdated(tab: chrome.tabs.Tab) {
    if (!tab.url || !tab.id) return;

    const session = await this.repository.getCurrentSession();
    if (!session) return;

    // 每次事件都从 storage 读取最新设置
    const savedSettings = await this.repository.getSettings();
    const settings = { ...this.getDefaultSettings(), ...savedSettings };

    const { strategy } = settings.dedup;
    const windowId = tab.windowId!.toString();
    const existingIndex = findTabIndexByKey(
      session.tabs,
      tab.url,
      windowId,
      strategy
    );

    if (existingIndex >= 0) {
      // 情况 1: URL 已存在，需要处理当前标签页的旧 URL 记录
      const oldTabData = this.tabIdMap.get(tab.id);
      if (oldTabData && oldTabData.url !== tab.url) {
        // 标签页从旧 URL 导航到已存在的 URL，删除旧记录
        const oldTabIndex = session.tabs.findIndex(
          (t) => t.url === oldTabData.url && t.windowId === oldTabData.windowId && !t.deletedAt
        );
        if (oldTabIndex >= 0) {
          session.tabs[oldTabIndex].deletedAt = Date.now();
        }
      }
      // 更新 tabId 映射，指向已存在的记录
      this.tabIdMap.delete(tab.id);
      this.tabIdMap.set(tab.id, session.tabs[existingIndex]);
      session.updatedAt = Date.now();
    } else {
      // 尝试找到原记录并更新（标签页从旧 URL 导航到新 URL）
      const oldTabData = this.tabIdMap.get(tab.id);
      if (oldTabData) {
        const oldTabIndex = session.tabs.findIndex(
          (t) => t.url === oldTabData.url && t.windowId === oldTabData.windowId && !t.deletedAt
        );
        if (oldTabIndex >= 0) {
          session.tabs[oldTabIndex].url = tab.url;
          session.tabs[oldTabIndex].title = tab.title;
          session.tabs[oldTabIndex].updatedAt = Date.now();
          session.updatedAt = Date.now();
          // 更新 tabId 映射
          this.tabIdMap.delete(tab.id);
          this.tabIdMap.set(tab.id, session.tabs[oldTabIndex]);
        }
      } else {
        // 情况 3: 标签页从 excluded 页面（如 newtab）导航过来，
        // tabIdMap 中没有记录，需要插入新记录
        session.tabs.push({
          url: tab.url,
          windowId: windowId,
          title: tab.title,
          tabIndex: tab.index || 0,
          isPinned: tab.pinned || false,
          openedAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
        });
        session.updatedAt = Date.now();
        this.tabIdMap.set(tab.id, session.tabs[session.tabs.length - 1]);
      }
    }

    if (session.updatedAt) {
      await this.repository.saveCurrentSession(session);
    }
  }

  /**
   * 标签页移动
   */
  public async onTabMoved(moveInfo: chrome.tabs.TabMoveInfo) {
    const session = await this.repository.getCurrentSession();
    if (!session) return;

    const windowId = moveInfo.windowId.toString();
    const fromIndex = moveInfo.fromIndex;
    const toIndex = moveInfo.toIndex;

    // 获取该窗口的所有标签页
    const windowTabs = session.tabs
      .filter(t => t.windowId === windowId && !t.deletedAt)
      .sort((a, b) => a.tabIndex - b.tabIndex);

    // 找到移动的标签页
    const movedTab = windowTabs.find(t => t.tabIndex === fromIndex);
    if (!movedTab) return;

    // 更新所有受影响标签页的索引
    if (toIndex > fromIndex) {
      // 向下移动：fromIndex+1 到 toIndex 的标签页索引 -1
      for (const tab of windowTabs) {
        if (tab.tabIndex > fromIndex && tab.tabIndex <= toIndex) {
          tab.tabIndex--;
          tab.updatedAt = Date.now();
        }
      }
    } else {
      // 向上移动：toIndex 到 fromIndex-1 的标签页索引 +1
      for (const tab of windowTabs) {
        if (tab.tabIndex >= toIndex && tab.tabIndex < fromIndex) {
          tab.tabIndex++;
          tab.updatedAt = Date.now();
        }
      }
    }

    // 更新移动的标签页索引
    movedTab.tabIndex = toIndex;
    movedTab.updatedAt = Date.now();
    session.updatedAt = Date.now();

    await this.repository.saveCurrentSession(session);
  }

  /**
   * 标签页激活
   */
  public async onTabActivated(activeInfo: chrome.tabs.TabActiveInfo) {
    // 记录激活状态，可用于恢复时聚焦到正确的标签
    const session = await this.repository.getCurrentSession();
    if (!session) return;

    // 更新窗口的聚焦状态
    const window = session.windows.find(
      (w) => w.windowId === activeInfo.windowId.toString()
    );
    if (window) {
      session.windows.forEach(w => w.isFocused = false);
      window.isFocused = true;
      session.updatedAt = Date.now();
      await this.repository.saveCurrentSession(session);
    }
  }

  /**
   * 窗口创建
   */
  public async onWindowCreated(window: chrome.windows.Window) {
    if (!window.id) return;

    const session = await this.repository.getCurrentSession();
    if (!session) return;

    // 检查窗口是否已存在
    const existingWindow = session.windows.find(w => w.windowId === window.id!.toString());
    if (existingWindow) return;

    // 添加新窗口
    session.windows.push({
      windowId: window.id!.toString(),
      windowType: window.type || 'normal',
      isFocused: window.focused || false,
      snapIndex: session.windows.length,
    });

    session.updatedAt = Date.now();
    await this.repository.saveCurrentSession(session);
  }

  /**
   * 窗口关闭
   */
  public async onWindowClosed(windowId: number) {
    const session = await this.repository.getCurrentSession();
    if (!session) return;

    // 移除已关闭的窗口
    const windowIdStr = windowId.toString();
    session.windows = session.windows.filter(w => w.windowId !== windowIdStr);
    session.updatedAt = Date.now();
    await this.repository.saveCurrentSession(session);
  }

  /**
   * 窗口聚焦变化
   */
  public async onWindowFocused(windowId: number) {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;

    const session = await this.repository.getCurrentSession();
    if (!session) return;

    session.windows.forEach(w => {
      w.isFocused = w.windowId === windowId.toString();
    });
    session.updatedAt = Date.now();
    await this.repository.saveCurrentSession(session);
  }
}

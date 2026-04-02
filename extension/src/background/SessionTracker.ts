import { CurrentSession, TabData, WindowData, Settings } from '../types';
import { StorageRepository } from '../repository/types';
import { findTabIndexByKey } from '../utils/dedup';
import { shouldCollect } from '../utils/urlFilter';

export class SessionTracker {
  private repository: StorageRepository;
  private currentSession: CurrentSession | null = null;
  private tabIdMap = new Map<number, TabData>();
  private settingsCache: Settings | null = null;

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

  private normalizeSettings(savedSettings?: Partial<Settings>): Settings {
    return {
      ...this.getDefaultSettings(),
      ...savedSettings,
      dedup: {
        ...this.getDefaultSettings().dedup,
        ...(savedSettings?.dedup || {}),
      },
      storage: {
        ...this.getDefaultSettings().storage,
        ...(savedSettings?.storage || {}),
      },
      snapshot: {
        ...this.getDefaultSettings().snapshot,
        ...(savedSettings?.snapshot || {}),
      },
      ui: {
        ...this.getDefaultSettings().ui,
        ...(savedSettings?.ui || {}),
      },
    };
  }

  private cloneWindow(window: WindowData): WindowData {
    return { ...window };
  }

  private cloneTab(tab: TabData): TabData {
    return { ...tab };
  }

  private cloneSession(session: CurrentSession): CurrentSession {
    return {
      id: session.id,
      updatedAt: session.updatedAt,
      windows: session.windows.map((window) => this.cloneWindow(window)),
      tabs: session.tabs.map((tab) => this.cloneTab(tab)),
    };
  }

  private async ensureSession(): Promise<CurrentSession> {
    if (!this.currentSession) {
      await this.fullCapture();
    }

    if (!this.currentSession) {
      throw new Error('Current session unavailable');
    }

    return this.currentSession;
  }

  public setSettings(settings: Settings) {
    this.settingsCache = this.normalizeSettings(settings);
  }

  public async initialize() {
    await this.fullCapture();
  }

  public async getSettings(): Promise<Settings> {
    if (!this.settingsCache) {
      const savedSettings = await this.repository.getSettings();
      this.settingsCache = this.normalizeSettings(savedSettings);
    }

    return this.normalizeSettings(this.settingsCache);
  }

  public getCurrentSession(): CurrentSession | null {
    if (!this.currentSession) {
      return null;
    }

    return this.cloneSession(this.currentSession);
  }

  public async fullCapture(): Promise<CurrentSession> {
    const windows = await chrome.windows.getAll({ populate: true });
    const capturedAt = Date.now();
    const nextTabIdMap = new Map<number, TabData>();
    const sessionWindows: WindowData[] = windows.map((window, index) => ({
      windowId: window.id!.toString(),
      windowType: window.type || 'normal',
      isFocused: window.focused || false,
      snapIndex: index,
    }));

    const sessionTabs: TabData[] = [];
    for (const window of windows) {
      for (const tab of window.tabs || []) {
        if (!shouldCollect(tab)) {
          continue;
        }

        const tabData: TabData = {
          url: tab.url!,
          windowId: window.id!.toString(),
          title: tab.title,
          tabIndex: tab.index,
          isPinned: tab.pinned || false,
          openedAt: capturedAt,
          updatedAt: capturedAt,
          deletedAt: null,
        };

        sessionTabs.push(tabData);
        if (tab.id) {
          nextTabIdMap.set(tab.id, tabData);
        }
      }
    }

    this.currentSession = {
      id: 'singleton',
      updatedAt: capturedAt,
      windows: sessionWindows,
      tabs: sessionTabs,
    };
    this.tabIdMap = nextTabIdMap;

    return this.cloneSession(this.currentSession);
  }

  public async isLastTrackedWindow(windowId: number): Promise<boolean> {
    const session = await this.ensureSession();
    const normalWindows = session.windows.filter((window) => window.windowType === 'normal');
    return normalWindows.length === 1 && normalWindows[0].windowId === windowId.toString();
  }

  public async onTabCreated(tab: chrome.tabs.Tab) {
    if (!tab.url || !tab.windowId) {
      return;
    }

    const session = await this.ensureSession();
    const settings = await this.getSettings();
    const windowId = tab.windowId.toString();
    const existingIndex = findTabIndexByKey(
      session.tabs,
      tab.url,
      windowId,
      settings.dedup.strategy
    );

    if (existingIndex >= 0) {
      session.tabs[existingIndex].windowId = windowId;
      session.tabs[existingIndex].title = tab.title;
      session.tabs[existingIndex].tabIndex = tab.index || 0;
      session.tabs[existingIndex].isPinned = tab.pinned || false;
      session.tabs[existingIndex].updatedAt = Date.now();
      session.tabs[existingIndex].deletedAt = null;
      if (tab.id) {
        this.tabIdMap.set(tab.id, session.tabs[existingIndex]);
      }
    } else {
      const tabData: TabData = {
        url: tab.url,
        windowId,
        title: tab.title,
        tabIndex: tab.index || 0,
        isPinned: tab.pinned || false,
        openedAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      };
      session.tabs.push(tabData);
      if (tab.id) {
        this.tabIdMap.set(tab.id, tabData);
      }
    }

    session.updatedAt = Date.now();
  }

  public async onTabClosed(tabId: number, _windowId: number) {
    const session = await this.ensureSession();

    if (this.tabIdMap.size === 0) {
      await this.rebuildTabIdMap();
    }

    const tabData = this.tabIdMap.get(tabId);
    if (tabData) {
      const sessionTab = session.tabs.find(
        (tab) => tab.url === tabData.url && tab.windowId === tabData.windowId && !tab.deletedAt
      );
      if (sessionTab) {
        sessionTab.deletedAt = Date.now();
        sessionTab.updatedAt = Date.now();
      }
      this.tabIdMap.delete(tabId);
      session.updatedAt = Date.now();
    }
  }

  private async rebuildTabIdMap() {
    try {
      const tabs = await chrome.tabs.query({});
      const session = await this.ensureSession();

      for (const tab of tabs) {
        if (!tab.id || !tab.url || !shouldCollect(tab)) {
          continue;
        }

        const existingTab = session.tabs.find(
          (sessionTab) =>
            sessionTab.url === tab.url &&
            sessionTab.windowId === tab.windowId!.toString() &&
            !sessionTab.deletedAt
        );
        if (existingTab) {
          this.tabIdMap.set(tab.id, existingTab);
        }
      }
    } catch (error) {
      console.error('[SessionTracker] Failed to rebuild tabIdMap:', error);
    }
  }

  public async onTabUpdated(tab: chrome.tabs.Tab) {
    if (!tab.url || !tab.id || !tab.windowId) {
      return;
    }

    const session = await this.ensureSession();
    const settings = await this.getSettings();
    const windowId = tab.windowId.toString();
    const existingIndex = findTabIndexByKey(
      session.tabs,
      tab.url,
      windowId,
      settings.dedup.strategy
    );

    if (existingIndex >= 0) {
      const oldTabData = this.tabIdMap.get(tab.id);
      if (oldTabData && oldTabData.url !== tab.url) {
        const oldTabIndex = session.tabs.findIndex(
          (sessionTab) =>
            sessionTab.url === oldTabData.url &&
            sessionTab.windowId === oldTabData.windowId &&
            !sessionTab.deletedAt
        );
        if (oldTabIndex >= 0) {
          session.tabs[oldTabIndex].deletedAt = Date.now();
          session.tabs[oldTabIndex].updatedAt = Date.now();
        }
      }

      const existingTab = session.tabs[existingIndex];
      existingTab.title = tab.title;
      existingTab.tabIndex = tab.index || existingTab.tabIndex;
      existingTab.isPinned = tab.pinned || false;
      existingTab.updatedAt = Date.now();
      existingTab.deletedAt = null;

      this.tabIdMap.delete(tab.id);
      this.tabIdMap.set(tab.id, existingTab);
      session.updatedAt = Date.now();
      return;
    }

    const oldTabData = this.tabIdMap.get(tab.id);
    if (oldTabData) {
      const oldTabIndex = session.tabs.findIndex(
        (sessionTab) =>
          sessionTab.url === oldTabData.url &&
          sessionTab.windowId === oldTabData.windowId &&
          !sessionTab.deletedAt
      );
      if (oldTabIndex >= 0) {
        session.tabs[oldTabIndex].url = tab.url;
        session.tabs[oldTabIndex].title = tab.title;
        session.tabs[oldTabIndex].tabIndex = tab.index || session.tabs[oldTabIndex].tabIndex;
        session.tabs[oldTabIndex].isPinned = tab.pinned || false;
        session.tabs[oldTabIndex].updatedAt = Date.now();
        session.updatedAt = Date.now();
        this.tabIdMap.set(tab.id, session.tabs[oldTabIndex]);
        return;
      }
    }

    const nextTab: TabData = {
      url: tab.url,
      windowId,
      title: tab.title,
      tabIndex: tab.index || 0,
      isPinned: tab.pinned || false,
      openedAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
    };
    session.tabs.push(nextTab);
    session.updatedAt = Date.now();
    this.tabIdMap.set(tab.id, nextTab);
  }

  public async onTabMoved(moveInfo: chrome.tabs.TabMoveInfo) {
    const session = await this.ensureSession();
    const windowId = moveInfo.windowId.toString();
    const fromIndex = moveInfo.fromIndex;
    const toIndex = moveInfo.toIndex;

    const windowTabs = session.tabs
      .filter((tab) => tab.windowId === windowId && !tab.deletedAt)
      .sort((left, right) => left.tabIndex - right.tabIndex);

    const movedTab = windowTabs.find((tab) => tab.tabIndex === fromIndex);
    if (!movedTab) {
      return;
    }

    if (toIndex > fromIndex) {
      for (const tab of windowTabs) {
        if (tab.tabIndex > fromIndex && tab.tabIndex <= toIndex) {
          tab.tabIndex -= 1;
          tab.updatedAt = Date.now();
        }
      }
    } else {
      for (const tab of windowTabs) {
        if (tab.tabIndex >= toIndex && tab.tabIndex < fromIndex) {
          tab.tabIndex += 1;
          tab.updatedAt = Date.now();
        }
      }
    }

    movedTab.tabIndex = toIndex;
    movedTab.updatedAt = Date.now();
    session.updatedAt = Date.now();
  }

  public async onTabActivated(activeInfo: chrome.tabs.TabActiveInfo) {
    const session = await this.ensureSession();
    const window = session.windows.find(
      (trackedWindow) => trackedWindow.windowId === activeInfo.windowId.toString()
    );

    if (!window) {
      return;
    }

    session.windows.forEach((trackedWindow) => {
      trackedWindow.isFocused = false;
    });
    window.isFocused = true;
    session.updatedAt = Date.now();
  }

  public async onWindowCreated(window: chrome.windows.Window) {
    if (!window.id) {
      return;
    }

    const session = await this.ensureSession();
    const existingWindow = session.windows.find(
      (trackedWindow) => trackedWindow.windowId === window.id!.toString()
    );
    if (existingWindow) {
      return;
    }

    session.windows.push({
      windowId: window.id!.toString(),
      windowType: window.type || 'normal',
      isFocused: window.focused || false,
      snapIndex: session.windows.length,
    });
    session.updatedAt = Date.now();
  }

  public async onWindowClosed(windowId: number) {
    const session = await this.ensureSession();
    const windowIdStr = windowId.toString();
    const deletedAt = Date.now();

    session.windows = session.windows.filter((window) => window.windowId !== windowIdStr);
    session.tabs.forEach((tab) => {
      if (tab.windowId === windowIdStr && !tab.deletedAt) {
        tab.deletedAt = deletedAt;
        tab.updatedAt = deletedAt;
      }
    });
    session.updatedAt = deletedAt;
  }

  public async onWindowFocused(windowId: number) {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      return;
    }

    const session = await this.ensureSession();
    session.windows.forEach((window) => {
      window.isFocused = window.windowId === windowId.toString();
    });
    session.updatedAt = Date.now();
  }
}

import { useState } from 'react';
import type { CurrentSession as SessionType } from '../../types';

interface CurrentSessionProps {
  session: SessionType | null;
  loading: boolean;
  onRefresh: () => void;
  onRestore: (force?: boolean) => void;
  refreshing: boolean;
}

export default function CurrentSession({
  session,
  loading,
  onRefresh,
  onRestore,
  refreshing,
}: CurrentSessionProps) {
  const [collapsedWindows, setCollapsedWindows] = useState<Record<string, boolean>>({});

  function toggleWindow(windowId: string) {
    setCollapsedWindows((current) => ({
      ...current,
      [windowId]: !current[windowId],
    }));
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>加载中...</p>
      </div>
    );
  }

  if (!session || session.tabs.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🗂️</div>
        <p>暂无会话数据</p>
        <p className="hint">打开标签页后会自动采集</p>
        <button className="btn btn-secondary" onClick={onRefresh} style={{ marginTop: '12px' }}>
          ↻ 刷新
        </button>
      </div>
    );
  }

  const activeTabs = session.tabs.filter((t) => !t.deletedAt);
  const deletedCount = session.tabs.filter((t) => t.deletedAt).length;

  return (
    <div className="current-session">
      <div className="session-summary">
        <span className="session-stat">
          <strong>{session.windows.length}</strong> 个窗口
        </span>
        <span className="session-stat">
          <strong>{activeTabs.length}</strong> 个标签页
        </span>
        {deletedCount > 0 && (
          <span className="session-stat muted">
            <strong>{deletedCount}</strong> 个已关闭
          </span>
        )}
        <button className="btn btn-primary" onClick={() => onRestore()}>
          ↩ 恢复当前会话
        </button>
        <button className="btn btn-ghost" onClick={onRefresh} title="刷新">
          {refreshing ? '⟳' : '↻'}
        </button>
      </div>

      {session.windows.map((win) => {
        const winTabs = activeTabs.filter((t) => t.windowId === win.windowId);
        if (winTabs.length === 0) return null;
        const isCollapsed = collapsedWindows[win.windowId] ?? false;
        return (
          <div key={win.windowId} className="window-group">
            <div className="window-group-header">
              <button className="window-toggle" onClick={() => toggleWindow(win.windowId)} type="button">
                <span className="window-group-title">
                  {isCollapsed ? '▸' : '▾'} {win.isFocused ? '◉' : '○'} {win.windowType === 'popup' ? '弹窗' : win.windowType === 'devtools' ? '开发者工具' : '窗口'} {win.snapIndex + 1}
                </span>
                <span className="window-group-count">{winTabs.length} 个标签</span>
              </button>
            </div>
            {!isCollapsed && (
              <div className="window-group-tabs">
                {winTabs.map((tab) => (
                  <div key={`${tab.url}-${tab.tabIndex}`} className="tab-row">
                    {tab.isPinned && <span className="pin-icon" title="已固定">📌</span>}
                    <a
                      className="tab-link"
                      href={tab.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={tab.url}
                      onClick={(e) => e.preventDefault()}
                      onDoubleClick={() => chrome.tabs.create({ url: tab.url, active: true })}
                    >
                      <span className="tab-link-title">{tab.title || tab.url}</span>
                      <span className="tab-link-url">{tab.url}</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

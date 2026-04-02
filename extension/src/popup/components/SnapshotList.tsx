import type { Snapshot, SnapshotDetail } from '../../types';

interface SnapshotListProps {
  snapshots: Snapshot[];
  onRestore: (snapshotId: string) => void;
  expandedSnapshotIds: string[];
  loadingDetailIds: string[];
  snapshotDetails: Record<string, SnapshotDetail | null | undefined>;
  onToggleDetail: (snapshotId: string) => void;
}

export default function SnapshotList({
  snapshots,
  onRestore,
  expandedSnapshotIds,
  loadingDetailIds,
  snapshotDetails,
  onToggleDetail,
}: SnapshotListProps) {
  if (snapshots.length === 0) return null;

  const latest = snapshots[0];
  const restCount = snapshots.length - 1;

  return (
    <div className="snapshot-list">
      {/* 最新快照 */}
      <div className="latest-snapshot">
        <div className="latest-header">
          <div className="latest-badge">最新</div>
          <span className="latest-time">{formatTime(latest.createdAt)}</span>
          <span className="latest-count">{snapshots.length} 个快照</span>
        </div>

        <div className="latest-meta">
          <span className="badge">{latest.windowCount} 个窗口</span>
          <span className="badge">{latest.tabCount} 个标签页</span>
        </div>

        <div className="latest-preview">
          {latest.summary.windows.slice(0, 2).map((win, idx) => (
            <div key={idx} className="preview-window">
              <div className="preview-window-title">窗口 {idx + 1}</div>
              {win.representativeTabs.slice(0, 2).map((tab, i) => (
                <div key={i} className="preview-tab-title">{tab}</div>
              ))}
              {win.representativeTabs.length > 2 && (
                <div className="preview-more">+{win.representativeTabs.length - 2} 更多</div>
              )}
            </div>
          ))}
        </div>

        <div className="latest-actions">
          <button className="btn btn-primary" onClick={() => onRestore(latest.id)}>
            ↩ 恢复此快照
          </button>
          <button className="btn btn-secondary" onClick={() => onToggleDetail(latest.id)}>
            {expandedSnapshotIds.includes(latest.id) ? '收起页面列表' : '查看页面列表'}
          </button>
        </div>

        {expandedSnapshotIds.includes(latest.id) && (
          <SnapshotDetailPanel
            snapshot={latest}
            detail={snapshotDetails[latest.id]}
            loading={loadingDetailIds.includes(latest.id)}
          />
        )}
      </div>

      {/* 其他快照折叠 */}
      {restCount > 0 && (
        <details className="snapshot-archive">
          <summary className="archive-summary">
            <span>其余 {restCount} 个快照</span>
            <span className="archive-chevron">›</span>
          </summary>
          <div className="archive-list">
            {snapshots.slice(1).map((s) => (
              <div key={s.id}>
                <div className="archive-item">
                  <div className="archive-info">
                    <span className="archive-time">{formatTime(s.createdAt)}</span>
                    <span className="archive-meta">{s.windowCount} 窗口 · {s.tabCount} 标签</span>
                  </div>
                  <div className="archive-actions">
                    <button
                      className="btn btn-ghost"
                      onClick={() => onRestore(s.id)}
                      title="恢复"
                    >
                      ↩
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => onToggleDetail(s.id)}
                      title="查看页面列表"
                    >
                      {expandedSnapshotIds.includes(s.id) ? '收起' : '详情'}
                    </button>
                  </div>
                </div>
                {expandedSnapshotIds.includes(s.id) && (
                  <SnapshotDetailPanel
                    snapshot={s}
                    detail={snapshotDetails[s.id]}
                    loading={loadingDetailIds.includes(s.id)}
                    compact
                  />
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

interface SnapshotDetailPanelProps {
  snapshot: Snapshot;
  detail: SnapshotDetail | null | undefined;
  loading: boolean;
  compact?: boolean;
}

function SnapshotDetailPanel({
  snapshot,
  detail,
  loading,
  compact = false,
}: SnapshotDetailPanelProps) {
  if (loading) {
    return <div className={`snapshot-detail ${compact ? 'compact' : ''}`}>加载页面列表中...</div>;
  }

  if (!detail) {
    return <div className={`snapshot-detail ${compact ? 'compact' : ''}`}>未能加载快照详情</div>;
  }

  return (
    <div className={`snapshot-detail ${compact ? 'compact' : ''}`}>
      {detail.windows.map((window, index) => {
        const tabs = detail.tabs
          .filter((tab) => tab.windowId === window.windowId)
          .sort((a, b) => a.tabIndex - b.tabIndex);

        if (tabs.length === 0) {
          return null;
        }

        return (
          <div key={`${snapshot.id}-${window.windowId}`} className="detail-window">
            <div className="detail-window-title">
              窗口 {index + 1} · {tabs.length} 个标签
            </div>
            <div className="detail-window-tabs">
              {tabs.map((tab) => (
                <div key={`${window.windowId}-${tab.tabIndex}-${tab.url}`} className="detail-tab-row">
                  <span className="detail-tab-title" title={tab.title || tab.url}>
                    {tab.title || tab.url}
                  </span>
                  <span className="detail-tab-url" title={tab.url}>
                    {tab.url}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

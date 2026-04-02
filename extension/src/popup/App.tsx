import { useState, useEffect, useRef } from 'react';
import SnapshotList from './components/SnapshotList';
import Settings from './components/Settings';
import Toast from './components/Toast';
import type {
  BackgroundRequest,
  RestoreSnapshotResponse,
  GetSnapshotsResponse,
  GetSnapshotDetailResponse,
  GetPopupStateResponse,
} from '../shared/messages';
import type { Settings as SettingsType, Snapshot, SnapshotDetail } from '../types';

/**
 * Popup 主应用组件
 */
export default function App() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [snapshotDetails, setSnapshotDetails] = useState<Record<string, SnapshotDetail | null | undefined>>({});
  const [expandedSnapshotIds, setExpandedSnapshotIds] = useState<string[]>([]);
  const [loadingDetailIds, setLoadingDetailIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // 每次打开 popup 先直接加载现有数据，避免被全量同步阻塞
  useEffect(() => {
    void loadPopupState();
  }, []);

  // 检查 URL 参数是否要显示设置页
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('settings') === 'true') {
      setShowSettings(true);
    }
  }, []);

  // 清理 toast 定时器
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  function showToast(message: string, type: 'success' | 'error' | 'info') {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  async function loadPopupState() {
    setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage(
        { action: 'getPopupState', limit: 20 } as BackgroundRequest
      ) as GetPopupStateResponse;
      if (response.success) {
        setSnapshots(response.data.snapshots);
        setSettings(response.data.settings);
      }
    } catch (err) {
      console.error('Popup load failed:', err);
    } finally {
      setLoading(false);
    }
  }

  async function syncData() {
    await loadPopupState();
  }

  async function handleToggleDetail(snapshotId: string) {
    if (expandedSnapshotIds.includes(snapshotId)) {
      setExpandedSnapshotIds((current) => current.filter((id) => id !== snapshotId));
      return;
    }

    setExpandedSnapshotIds((current) => [...current, snapshotId]);
    if (snapshotDetails[snapshotId] !== undefined) {
      return;
    }

    setLoadingDetailIds((current) => [...current, snapshotId]);
    try {
      const response = await chrome.runtime.sendMessage(
        { action: 'getSnapshotDetail', id: snapshotId } as BackgroundRequest
      ) as GetSnapshotDetailResponse;
      setSnapshotDetails((current) => ({
        ...current,
        [snapshotId]: response.success ? response.data : null,
      }));
    } catch {
      setSnapshotDetails((current) => ({
        ...current,
        [snapshotId]: null,
      }));
    } finally {
      setLoadingDetailIds((current) => current.filter((id) => id !== snapshotId));
    }
  }

  async function handleCreateSnapshot() {
    try {
      const request: BackgroundRequest = { action: 'createSnapshot' };
      const response = await chrome.runtime.sendMessage(request);
      if (response.success) {
        showToast('快照已创建', 'success');
        // 刷新快照列表
        const r = await chrome.runtime.sendMessage({ action: 'getSnapshots', limit: 20 } as BackgroundRequest) as GetSnapshotsResponse;
        if (r.success) setSnapshots(r.data);
      } else {
        showToast(response.error || '创建快照失败', 'error');
      }
    } catch (err) {
      showToast('创建快照失败', 'error');
    }
  }

  async function handleRestore(snapshotId: string, force = false) {
    try {
      const request: BackgroundRequest = {
        action: 'restoreSnapshot',
        snapshotId,
        options: { force },
      };
      const response = await chrome.runtime.sendMessage(request) as RestoreSnapshotResponse;
      if (response.success) {
        const { windowsCreated, tabsCreated, failedTabs } = response.data;
        if (failedTabs.length > 0) {
          showToast(`已恢复 ${windowsCreated} 个窗口，${tabsCreated} 个标签页，${failedTabs.length} 个失败`, 'info');
        } else {
          showToast(`已恢复 ${windowsCreated} 个窗口，${tabsCreated} 个标签页`, 'success');
        }
        await syncData();
      } else {
        if (response.error?.includes('Recently restored')) {
          if (confirm('5 分钟内已恢复过此快照，确认要再次恢复吗？')) {
            void handleRestore(snapshotId, true);
          }
        } else {
          showToast(response.error || '恢复失败', 'error');
        }
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }

  if (showSettings) {
    return (
      <Settings
        onBack={() => setShowSettings(false)}
        onSave={() => {
          showToast('设置已保存', 'success');
          loadPopupState();
        }}
      />
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>归屿 ⛰️</h1>
        <button
          className="btn btn-secondary"
          onClick={() => setShowSettings(true)}
          title="设置"
        >
          ⚙️
        </button>
      </header>

      <main className="main">
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={handleCreateSnapshot}
            disabled={loading}
          >
            📸 立即保存
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => void syncData()}
            disabled={loading}
          >
            ↻ 同步
          </button>
        </div>
        <div className="status-card">
          <div className="status-card-label">自动保存</div>
          <div className="status-card-value">
            {settings
              ? settings.snapshot.autoSaveInterval > 0
                ? `每 ${settings.snapshot.autoSaveInterval} 分钟`
                : '关闭，仅事件触发'
              : '读取中...'}
          </div>
          <div className="status-card-hint">
            当前展示和恢复都基于快照，不基于实时会话。
          </div>
        </div>
        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <p>加载中...</p>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📭</div>
            <p>暂无快照</p>
            <p className="hint">打开有效标签页后，点击“立即保存”创建第一份快照</p>
          </div>
        ) : (
          <SnapshotList
            snapshots={snapshots}
            onRestore={handleRestore}
            expandedSnapshotIds={expandedSnapshotIds}
            loadingDetailIds={loadingDetailIds}
            snapshotDetails={snapshotDetails}
            onToggleDetail={handleToggleDetail}
          />
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

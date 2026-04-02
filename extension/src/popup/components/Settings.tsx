import { useState, useEffect } from 'react';
import type { Settings as SettingsType } from '../../types';
import type { BackgroundRequest, GetSettingsResponse, SaveSettingsResponse } from '../../shared/messages';

interface SettingsProps {
  onBack: () => void;
  onSave: () => void;
}

/**
 * 设置页面组件
 */
export default function Settings({ onBack, onSave }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsType>({
    dedup: { strategy: 'per-window' },
    storage: { level: 1 },
    snapshot: { maxSnapshots: 20, autoSaveInterval: 5 },
    ui: { showRecoveryPromptOnStartup: false },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const request: BackgroundRequest = { action: 'getSettings' };
      const response = await chrome.runtime.sendMessage(request) as GetSettingsResponse;
      if (response.success) {
        setSettings(response.data);
        setLoadError(null);
      } else {
        setLoadError(response.error || '加载设置失败');
      }
    } catch (err) {
      setLoadError((err as Error).message || '加载设置失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const request: BackgroundRequest = { action: 'saveSettings', settings };
      const response = await chrome.runtime.sendMessage(request) as SaveSettingsResponse;
      if (response.success) {
        onSave();
        onBack();
      } else {
        setError(response.error || '保存设置失败');
        setSaving(false);
      }
    } catch (err) {
      setError((err as Error).message || '保存设置失败');
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="settings loading">
        <div className="spinner" />
        <p>加载中...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="settings">
        <header className="header">
          <button className="btn btn-secondary" onClick={onBack}>
            ← 返回
          </button>
          <h1>设置</h1>
        </header>

        <div className="retry-section">
          <div className="retry-icon">⚠️</div>
          <p>{loadError}</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button className="btn btn-secondary" onClick={onBack}>返回</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setLoading(true);
                loadSettings();
              }}
            >
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings">
      <header className="header">
        <button className="btn btn-secondary" onClick={onBack}>
          ← 返回
        </button>
        <h1>设置</h1>
      </header>

      <div className="settings-content">
        <section className="settings-hero">
          <div className="settings-hero-title">自动保存快照</div>
          <div className="settings-hero-value">
            {settings.snapshot.autoSaveInterval > 0
              ? `每 ${settings.snapshot.autoSaveInterval} 分钟自动保存`
              : '已关闭自动保存'}
          </div>
          <div className="settings-hero-hint">0 表示不按时间自动保存，仅在事件或手动保存时尝试生成快照。</div>
        </section>

        <section className="setting-section">
          <h2 className="section-title">📸 快照设置</h2>
          <div className="setting-item setting-card">
            <div className="setting-card-body">
              <div className="setting-card-copy">
                <strong>最大保留快照数量</strong>
                <p className="hint">控制历史快照列表的上限。超过上限时，会自动删除更旧的快照。</p>
              </div>
              <input
                type="number"
                className="input setting-number-input"
                value={settings.snapshot.maxSnapshots}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    snapshot: { ...settings.snapshot, maxSnapshots: parseInt(e.target.value) || 20 },
                  })
                }
                min="1"
                max="100"
              />
            </div>
          </div>
          <div className="setting-item setting-card setting-item-highlight">
            <div className="setting-card-body">
              <div className="setting-card-copy">
                <strong>自动保存间隔</strong>
                <p className="hint">单位为分钟。建议 5 到 15 分钟。设为 0 后，只在手动保存或事件触发时尝试生成快照。</p>
              </div>
              <div className="setting-inline-input">
                <input
                  type="number"
                  className="input setting-number-input"
                  value={settings.snapshot.autoSaveInterval}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      snapshot: { ...settings.snapshot, autoSaveInterval: parseInt(e.target.value) || 0 },
                    })
                  }
                  min="0"
                  max="60"
                />
                <span className="setting-inline-suffix">分钟</span>
              </div>
            </div>
          </div>
        </section>

        {/* 存储级别 */}
        <section className="setting-section">
          <h2 className="section-title">💾 存储级别</h2>
          <div className="setting-item">
            <label>
              <input
                type="radio"
                name="storage"
                value="1"
                checked={settings.storage.level === 1}
                onChange={() =>
                  setSettings({
                    ...settings,
                    storage: { ...settings.storage, level: 1 },
                  })
                }
              />
              <strong>Level 1 - 浏览器存储</strong>
              <p className="hint">使用 chrome.storage，数据保存在浏览器本地</p>
            </label>
          </div>
          <div className="setting-item">
            <label>
              <input
                type="radio"
                name="storage"
                value="2"
                checked={settings.storage.level === 2}
                onChange={() =>
                  setSettings({
                    ...settings,
                    storage: { ...settings.storage, level: 2 },
                  })
                }
              />
              <strong>Level 2 - SQLite 本地数据库</strong>
              <p className="hint">使用本地 SQLite 数据库，支持更大数据量（需安装 Native Host）</p>
            </label>
          </div>
          <div className="setting-item">
            <label>
              <input
                type="radio"
                name="storage"
                value="3"
                checked={settings.storage.level === 3}
                onChange={() =>
                  setSettings({
                    ...settings,
                    storage: { ...settings.storage, level: 3 },
                  })
                }
              />
              <strong>Level 3 - 云端数据库</strong>
              <p className="hint">支持 PostgreSQL/MySQL，多设备同步（需配置数据库连接）</p>
            </label>
          </div>
        </section>

        {/* URL 去重策略 */}
        <section className="setting-section">
          <h2 className="section-title">URL 去重策略</h2>
          <div className="setting-item">
            <label>
              <input
                type="radio"
                name="dedup"
                value="strict"
                checked={settings.dedup.strategy === 'strict'}
                onChange={() =>
                  setSettings({
                    ...settings,
                    dedup: { strategy: 'strict' },
                  })
                }
              />
              <strong>严格去重</strong>
              <p className="hint">全局唯一，相同 URL 只保存一份</p>
            </label>
          </div>
          <div className="setting-item">
            <label>
              <input
                type="radio"
                name="dedup"
                value="per-window"
                checked={settings.dedup.strategy === 'per-window'}
                onChange={() =>
                  setSettings({
                    ...settings,
                    dedup: { strategy: 'per-window' },
                  })
                }
              />
              <strong>按窗口去重</strong>
              <p className="hint">同一窗口内去重，跨窗口可重复（推荐）</p>
            </label>
          </div>
          <div className="setting-item">
            <label>
              <input
                type="radio"
                name="dedup"
                value="none"
                checked={settings.dedup.strategy === 'none'}
                onChange={() =>
                  setSettings({
                    ...settings,
                    dedup: { strategy: 'none' },
                  })
                }
              />
              <strong>完全不去重</strong>
              <p className="hint">每个标签页独立记录，100% 忠实恢复</p>
            </label>
          </div>
        </section>

        {/* UI 设置 */}
        <section className="setting-section">
          <h2 className="section-title">界面设置</h2>
          <div className="setting-item">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.ui.showRecoveryPromptOnStartup}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    ui: { ...settings.ui, showRecoveryPromptOnStartup: e.target.checked },
                  })
                }
              />
              浏览器启动时提示恢复
            </label>
          </div>
        </section>
      </div>

      {error && (
        <div className="settings-error">
          <span>{error}</span>
          <button className="btn-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      <footer className="settings-footer">
        <button className="btn btn-secondary" onClick={onBack}>
          取消
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
      </footer>
    </div>
  );
}

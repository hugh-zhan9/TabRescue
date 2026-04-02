import { useState, useEffect } from 'react';
import type { Settings as SettingsType } from '../../types';
import type { BackgroundRequest, GetSettingsResponse, SaveSettingsResponse } from '../../shared/messages';

interface SettingsProps {
  onBack: () => void;
  onSave: () => void;
}

const defaultSettings: SettingsType = {
  dedup: { strategy: 'per-window' },
  storage: {
    level: 1,
    remoteType: 'postgresql',
    sqlite: { path: '' },
    postgresql: {
      host: 'localhost',
      port: 5432,
      database: 'tabrescue',
      user: 'postgres',
      password: '',
      ssl: false,
    },
    mysql: {
      host: 'localhost',
      port: 3306,
      database: 'tabrescue',
      user: 'root',
      password: '',
      ssl: false,
    },
  },
  snapshot: { maxSnapshots: 20, autoSaveInterval: 5 },
  ui: { showRecoveryPromptOnStartup: false },
};

function normalizeSettings(value?: Partial<SettingsType>): SettingsType {
  const normalizedPostgresql = {
    host: value?.storage?.postgresql?.host ?? defaultSettings.storage.postgresql!.host,
    port: value?.storage?.postgresql?.port ?? defaultSettings.storage.postgresql!.port,
    database: value?.storage?.postgresql?.database ?? defaultSettings.storage.postgresql!.database,
    user: value?.storage?.postgresql?.user ?? defaultSettings.storage.postgresql!.user,
    password: value?.storage?.postgresql?.password ?? defaultSettings.storage.postgresql!.password,
    ssl: value?.storage?.postgresql?.ssl ?? defaultSettings.storage.postgresql!.ssl,
  };

  const normalizedMysql = {
    host: value?.storage?.mysql?.host ?? defaultSettings.storage.mysql!.host,
    port: value?.storage?.mysql?.port ?? defaultSettings.storage.mysql!.port,
    database: value?.storage?.mysql?.database ?? defaultSettings.storage.mysql!.database,
    user: value?.storage?.mysql?.user ?? defaultSettings.storage.mysql!.user,
    password: value?.storage?.mysql?.password ?? defaultSettings.storage.mysql!.password,
    ssl: value?.storage?.mysql?.ssl ?? defaultSettings.storage.mysql!.ssl,
  };

  return {
    dedup: {
      strategy: value?.dedup?.strategy ?? defaultSettings.dedup.strategy,
    },
    storage: {
      level: value?.storage?.level ?? defaultSettings.storage.level,
      remoteType: value?.storage?.remoteType ?? (value?.storage?.mysql ? 'mysql' : 'postgresql'),
      sqlite: {
        path: value?.storage?.sqlite?.path ?? defaultSettings.storage.sqlite?.path ?? '',
      },
      postgresql: normalizedPostgresql,
      mysql: normalizedMysql,
    },
    snapshot: {
      maxSnapshots: value?.snapshot?.maxSnapshots ?? defaultSettings.snapshot.maxSnapshots,
      autoSaveInterval: value?.snapshot?.autoSaveInterval ?? defaultSettings.snapshot.autoSaveInterval,
    },
    ui: {
      showRecoveryPromptOnStartup:
        value?.ui?.showRecoveryPromptOnStartup ?? defaultSettings.ui.showRecoveryPromptOnStartup,
    },
  };
}

/**
 * 设置页面组件
 */
export default function Settings({ onBack, onSave }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsType>(defaultSettings);
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
        setSettings(normalizeSettings(response.data));
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

  function updateStorageLevel(level: 1 | 2 | 3) {
    setSettings({
      ...settings,
      storage: {
        ...settings.storage,
        level,
        remoteType: settings.storage.remoteType || 'postgresql',
        sqlite: settings.storage.sqlite || defaultSettings.storage.sqlite,
        postgresql: settings.storage.postgresql || defaultSettings.storage.postgresql,
        mysql: settings.storage.mysql || defaultSettings.storage.mysql,
      },
    });
  }

  function updateRemoteType(remoteType: 'postgresql' | 'mysql') {
    setSettings({
      ...settings,
      storage: {
        ...settings.storage,
        level: 3,
        remoteType,
      },
    });
  }

  const remoteType = settings.storage.remoteType || 'postgresql';

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

        {/* 数据源设置 */}
        <section className="setting-section">
          <h2 className="section-title">💾 数据源</h2>
          <div className="setting-item">
            <label>
              <input
                type="radio"
                name="storage"
                value="1"
                checked={settings.storage.level === 1}
                onChange={() => updateStorageLevel(1)}
              />
              <div className="radio-content">
                <strong>浏览器本地存储</strong>
                <p className="hint">Level 1，使用浏览器扩展存储，零配置即可用。</p>
              </div>
            </label>
          </div>
          <div className="setting-item">
            <label>
              <input
                type="radio"
                name="storage"
                value="2"
                checked={settings.storage.level === 2}
                onChange={() => updateStorageLevel(2)}
              />
              <div className="radio-content">
                <strong>本地 SQLite 数据库</strong>
                <p className="hint">Level 2，适合大容量本机存储，需要安装 Native Host。</p>
              </div>
            </label>
            {settings.storage.level === 2 && (
              <div className="setting-subpanel">
                <div className="setting-field">
                  <span className="setting-field-label">SQLite 路径</span>
                  <input
                    type="text"
                    className="input"
                    value={settings.storage.sqlite?.path || ''}
                    placeholder="留空则使用宿主默认路径"
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        storage: {
                          ...settings.storage,
                          sqlite: { path: e.target.value },
                        },
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>
          <div className="setting-item">
            <label>
              <input
                type="radio"
                name="storage"
                value="3"
                checked={settings.storage.level === 3}
                onChange={() => updateStorageLevel(3)}
              />
              <div className="radio-content">
                <strong>远程数据库</strong>
                <p className="hint">Level 3，支持 PostgreSQL 或 MySQL，适合跨设备同步。</p>
              </div>
            </label>
            {settings.storage.level === 3 && (
              <div className="setting-subpanel">
                <div className="setting-inline-choice">
                  <label className="choice-pill">
                    <input
                      type="radio"
                      name="remoteType"
                      value="postgresql"
                      checked={remoteType === 'postgresql'}
                      onChange={() => updateRemoteType('postgresql')}
                    />
                    <span>PostgreSQL</span>
                  </label>
                  <label className="choice-pill">
                    <input
                      type="radio"
                      name="remoteType"
                      value="mysql"
                      checked={remoteType === 'mysql'}
                      onChange={() => updateRemoteType('mysql')}
                    />
                    <span>MySQL</span>
                  </label>
                </div>

                {remoteType === 'postgresql' && (
                  <div className="setting-grid">
                    <div className="setting-field">
                      <span className="setting-field-label">主机</span>
                      <input
                        type="text"
                        className="input"
                        value={settings.storage.postgresql?.host || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            storage: {
                              ...settings.storage,
                              postgresql: {
                                ...settings.storage.postgresql!,
                                host: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="setting-field">
                      <span className="setting-field-label">端口</span>
                      <input
                        type="number"
                        className="input"
                        value={settings.storage.postgresql?.port || 5432}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            storage: {
                              ...settings.storage,
                              postgresql: {
                                ...settings.storage.postgresql!,
                                port: parseInt(e.target.value, 10) || 5432,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="setting-field">
                      <span className="setting-field-label">数据库</span>
                      <input
                        type="text"
                        className="input"
                        value={settings.storage.postgresql?.database || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            storage: {
                              ...settings.storage,
                              postgresql: {
                                ...settings.storage.postgresql!,
                                database: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="setting-field">
                      <span className="setting-field-label">用户名</span>
                      <input
                        type="text"
                        className="input"
                        value={settings.storage.postgresql?.user || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            storage: {
                              ...settings.storage,
                              postgresql: {
                                ...settings.storage.postgresql!,
                                user: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="setting-field setting-field-full">
                      <span className="setting-field-label">密码</span>
                      <input
                        type="password"
                        className="input"
                        value={settings.storage.postgresql?.password || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            storage: {
                              ...settings.storage,
                              postgresql: {
                                ...settings.storage.postgresql!,
                                password: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <label className="checkbox-line setting-field-full">
                      <input
                        type="checkbox"
                        checked={settings.storage.postgresql?.ssl || false}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            storage: {
                              ...settings.storage,
                              postgresql: {
                                ...settings.storage.postgresql!,
                                ssl: e.target.checked,
                              },
                            },
                          })
                        }
                      />
                      使用 SSL/TLS
                    </label>
                  </div>
                )}

                {remoteType === 'mysql' && (
                  <div className="setting-grid">
                    <div className="setting-field">
                      <span className="setting-field-label">主机</span>
                      <input
                        type="text"
                        className="input"
                        value={settings.storage.mysql?.host || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            storage: {
                              ...settings.storage,
                              mysql: {
                                ...settings.storage.mysql!,
                                host: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="setting-field">
                      <span className="setting-field-label">端口</span>
                      <input
                        type="number"
                        className="input"
                        value={settings.storage.mysql?.port || 3306}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            storage: {
                              ...settings.storage,
                              mysql: {
                                ...settings.storage.mysql!,
                                port: parseInt(e.target.value, 10) || 3306,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="setting-field">
                      <span className="setting-field-label">数据库</span>
                      <input
                        type="text"
                        className="input"
                        value={settings.storage.mysql?.database || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            storage: {
                              ...settings.storage,
                              mysql: {
                                ...settings.storage.mysql!,
                                database: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="setting-field">
                      <span className="setting-field-label">用户名</span>
                      <input
                        type="text"
                        className="input"
                        value={settings.storage.mysql?.user || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            storage: {
                              ...settings.storage,
                              mysql: {
                                ...settings.storage.mysql!,
                                user: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="setting-field setting-field-full">
                      <span className="setting-field-label">密码</span>
                      <input
                        type="password"
                        className="input"
                        value={settings.storage.mysql?.password || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            storage: {
                              ...settings.storage,
                              mysql: {
                                ...settings.storage.mysql!,
                                password: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <label className="checkbox-line setting-field-full">
                      <input
                        type="checkbox"
                        checked={settings.storage.mysql?.ssl || false}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            storage: {
                              ...settings.storage,
                              mysql: {
                                ...settings.storage.mysql!,
                                ssl: e.target.checked,
                              },
                            },
                          })
                        }
                      />
                      使用 SSL/TLS
                    </label>
                  </div>
                )}

                <p className="hint setting-note">
                  这里只保存扩展侧的数据源配置。Native Host 也需要按相同数据源准备连接环境。
                </p>
              </div>
            )}
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

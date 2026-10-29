import { useEffect, useState } from 'react';
import type { PageAccessMode } from '../../shared/types/storage';
import { SiteDenylistEditor } from './SiteDenylistEditor';

export interface PermissionSettingsProps {
  pageAccessMode: PageAccessMode;
  selectionButtonEnabled: boolean;
  siteDenylist: string[];
  gatewayState?: 'idle' | 'granted' | 'required';
  onEnableAutomatic(): Promise<{ granted: boolean }>;
  onDisableAutomatic(removePermission: boolean): Promise<void>;
  onSelectionButtonChange(enabled: boolean): Promise<void>;
  onDenylistChange(patterns: string[]): Promise<void>;
}

export function PermissionSettings({
  pageAccessMode,
  selectionButtonEnabled,
  siteDenylist,
  gatewayState = 'idle',
  onEnableAutomatic,
  onDisableAutomatic,
  onSelectionButtonChange,
  onDenylistChange,
}: PermissionSettingsProps) {
  const [mode, setMode] = useState(pageAccessMode);
  const [selectionEnabled, setSelectionEnabled] = useState(selectionButtonEnabled);
  const [denylist, setDenylist] = useState(siteDenylist);
  const [permissionNotice, setPermissionNotice] = useState<string>();
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [removePermission, setRemovePermission] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setMode(pageAccessMode), [pageAccessMode]);
  useEffect(() => setSelectionEnabled(selectionButtonEnabled), [selectionButtonEnabled]);
  useEffect(() => setDenylist(siteDenylist), [siteDenylist]);

  async function enableAutomatic() {
    if (mode === 'all-sites' || busy) return;
    setBusy(true);
    setPermissionNotice(undefined);
    try {
      const result = await onEnableAutomatic();
      if (result.granted) {
        setMode('all-sites');
        setPermissionNotice('已启用自动网站访问。排除列表仍会优先生效。');
      } else {
        setMode('active-tab');
        setPermissionNotice('未授予网站访问权限，仍保持仅在点击插件时运行。');
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmAutomaticDisable() {
    setBusy(true);
    try {
      await onDisableAutomatic(removePermission);
      setMode('active-tab');
      setConfirmDisable(false);
      setRemovePermission(false);
      setPermissionNotice('已关闭自动网站访问。');
    } finally {
      setBusy(false);
    }
  }

  async function changeSelectionButton(enabled: boolean) {
    setSelectionEnabled(enabled);
    try {
      await onSelectionButtonChange(enabled);
    } catch (error) {
      setSelectionEnabled(!enabled);
      throw error;
    }
  }

  async function changeDenylist(patterns: string[]) {
    await onDenylistChange(patterns);
    setDenylist(patterns);
  }

  return (
    <section className="settings-card permission-settings" aria-labelledby="page-access-title">
      <div className="card-heading permission-heading">
        <div>
          <p className="eyebrow">页面访问</p>
          <h2 id="page-access-title">选择扩展何时在网站上运行</h2>
          <p>默认只响应你的点击。自动模式会单独请求 HTTP 和 HTTPS 网站权限。</p>
        </div>
        {gatewayState === 'granted' && <span className="status-badge status-badge--success">Gateway 已授权</span>}
        {gatewayState === 'required' && <span className="status-badge status-badge--warning">Gateway 待授权</span>}
      </div>

      <fieldset className="page-access-options" disabled={busy}>
        <legend className="sr-only">网站运行方式</legend>
        <label className={`access-choice${mode === 'active-tab' ? ' access-choice--selected' : ''}`}>
          <input
            aria-label="仅在点击插件时运行"
            checked={mode === 'active-tab'}
            name="page-access-mode"
            onChange={() => {
              if (mode === 'all-sites') setConfirmDisable(true);
            }}
            type="radio"
          />
          <span className="access-choice-copy">
            <strong>仅在点击插件时运行</strong>
            <small>推荐。使用 activeTab 权限，只读取你主动打开侧边栏的当前页面。</small>
          </span>
        </label>
        <label className={`access-choice${mode === 'all-sites' ? ' access-choice--selected' : ''}`}>
          <input
            aria-label="自动在网站上启用"
            checked={mode === 'all-sites'}
            name="page-access-mode"
            onChange={() => void enableAutomatic()}
            type="radio"
          />
          <span className="access-choice-copy">
            <strong>自动在网站上启用</strong>
            <small>在普通 HTTP/HTTPS 页面加载后启用划词入口；排除的网站不会自动读取。</small>
          </span>
        </label>
      </fieldset>

      {permissionNotice && <p className="permission-status" role="status">{permissionNotice}</p>}

      <label className="toggle-row">
        <span className="setting-copy">
          <strong>显示划词提问按钮</strong>
          <small>选中文本后，在页面旁显示快捷提问入口。</small>
        </span>
        <input
          checked={selectionEnabled}
          disabled={busy}
          onChange={(event) => void changeSelectionButton(event.target.checked)}
          role="switch"
          type="checkbox"
        />
      </label>

      <SiteDenylistEditor
        disabled={busy}
        onChange={changeDenylist}
        patterns={denylist}
      />

      {confirmDisable && (
        <div className="dialog-backdrop">
          <div aria-labelledby="disable-access-title" aria-modal="true" className="permission-dialog" role="dialog">
            <h3 id="disable-access-title">关闭自动网站访问</h3>
            <p>动态内容脚本会立即注销。你也可以同时撤销 Chrome 中已授予的广泛网站权限。</p>
            <label className="dialog-checkbox">
              <input
                checked={removePermission}
                onChange={(event) => setRemovePermission(event.target.checked)}
                type="checkbox"
              />
              <span>同时移除 HTTP 和 HTTPS 网站访问权限</span>
            </label>
            <div className="dialog-actions">
              <button className="secondary-button" disabled={busy} onClick={() => setConfirmDisable(false)} type="button">取消</button>
              <button className="primary-button" disabled={busy} onClick={() => void confirmAutomaticDisable()} type="button">确认关闭自动访问</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

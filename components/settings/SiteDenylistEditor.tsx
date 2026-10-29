import { useState, type FormEvent } from 'react';
import { normalizeSitePattern } from '../../core/permissions/site-pattern';

interface SiteDenylistEditorProps {
  patterns: string[];
  onChange(patterns: string[]): Promise<void>;
  disabled?: boolean;
}

export function SiteDenylistEditor({ patterns, onChange, disabled = false }: SiteDenylistEditorProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function addPattern(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeSitePattern(draft);
    if (!normalized) {
      setError('请输入 HTTP 或 HTTPS 网站地址、域名，或 *.example.com 形式的子域规则。');
      return;
    }
    setError(undefined);
    if (patterns.includes(normalized)) {
      setDraft('');
      return;
    }
    setBusy(true);
    try {
      await onChange([...patterns, normalized]);
      setDraft('');
    } finally {
      setBusy(false);
    }
  }

  async function removePattern(pattern: string) {
    setBusy(true);
    try {
      await onChange(patterns.filter((item) => item !== pattern));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="denylist-editor">
      <div className="setting-copy">
        <label className="setting-label" htmlFor="site-denylist-input">排除的网站</label>
        <p id="site-denylist-help">这些网站不会自动读取页面，也不会显示划词操作。需要时可在侧边栏明确允许一次。</p>
      </div>
      <form className="denylist-form" onSubmit={addPattern}>
        <input
          id="site-denylist-input"
          aria-describedby={`site-denylist-help${error ? ' site-denylist-error' : ''}`}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          disabled={disabled || busy}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(undefined);
          }}
          placeholder="example.com 或 *.example.com"
          type="text"
          value={draft}
        />
        <button className="secondary-button denylist-add" disabled={disabled || busy} type="submit">
          添加排除网站
        </button>
      </form>
      {error && <p className="field-error" id="site-denylist-error" role="alert">{error}</p>}
      {patterns.length > 0 && (
        <ul className="denylist-list" aria-label="已排除的网站">
          {patterns.map((pattern) => (
            <li key={pattern}>
              <code>{pattern}</code>
              <button
                aria-label={`移除 ${pattern}`}
                className="icon-button"
                disabled={disabled || busy}
                onClick={() => void removePattern(pattern)}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

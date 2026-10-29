import { useId, useMemo, useState, type FormEvent } from 'react';
import { analyzeGatewayBaseUrl } from '../../core/permissions/gateway-origin';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { DEFAULT_PROVIDER_BASE_URLS, type ProviderType } from '../../shared/types/provider';
import { Select } from '../ui/Select';

export interface QuickSetupValues {
  type: ProviderType;
  baseURL: string;
  apiKey: string;
}

interface QuickSetupCardProps {
  busy?: boolean;
  /** Localized error from the last attempt. */
  error?: string;
  /** Called from the submit gesture so the Gateway origin permission can be requested synchronously. */
  onSubmit(values: QuickSetupValues): void;
  onOpenSettings(): void;
}

/** Compact first-run Gateway form shown in the side panel until a Gateway is configured. */
export function QuickSetupCard({ busy = false, error, onSubmit, onOpenSettings }: QuickSetupCardProps) {
  const { messages } = useI18n();
  const idPrefix = useId();
  const [type, setType] = useState<ProviderType>('openai-compatible');
  const [baseURL, setBaseURL] = useState(DEFAULT_PROVIDER_BASE_URLS['openai-compatible']);
  const [apiKey, setApiKey] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [validation, setValidation] = useState<string>();

  const transport = useMemo(() => {
    try { return analyzeGatewayBaseUrl(baseURL).transport; } catch { return undefined; }
  }, [baseURL]);
  const isHttp = transport === 'insecure-local' || transport === 'insecure-remote';

  function changeType(next: ProviderType) {
    // Swap the Base URL only while it is still the other format's default, like the settings page.
    const trimmed = baseURL.trim();
    if (!trimmed || trimmed === DEFAULT_PROVIDER_BASE_URLS[type]) setBaseURL(DEFAULT_PROVIDER_BASE_URLS[next]);
    setType(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!transport) { setValidation(messages.validationBaseUrl); return; }
    if (!apiKey.trim()) { setValidation(messages.quickSetupApiKeyRequired); return; }
    if (isHttp && !acknowledged) { setValidation(messages.validationInsecureAck); return; }
    setValidation(undefined);
    onSubmit({ type, baseURL: baseURL.trim(), apiKey: apiKey.trim() });
  }

  const shownError = validation ?? error;

  return (
    <form className="quick-setup" aria-labelledby={`${idPrefix}-title`} onSubmit={submit} noValidate>
      <div className="quick-setup__heading">
        <strong id={`${idPrefix}-title`}>{messages.quickSetupTitle}</strong>
        <span>{messages.quickSetupDescription}</span>
      </div>

      <Select
        className="quick-setup__select"
        label={messages.apiFormat}
        value={type}
        disabled={busy}
        options={[
          { value: 'openai-compatible', label: messages.apiFormatOpenAI },
          { value: 'anthropic-messages', label: messages.apiFormatAnthropic },
        ]}
        onChange={changeType}
      />

      <label className="quick-setup__field">
        <span>{messages.baseUrl}</span>
        <input
          inputMode="url"
          value={baseURL}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          placeholder={DEFAULT_PROVIDER_BASE_URLS[type]}
          onChange={(event) => { setBaseURL(event.target.value); setAcknowledged(false); }}
        />
      </label>

      <label className="quick-setup__field">
        <span>{messages.apiKey}</span>
        <input
          type="password"
          value={apiKey}
          disabled={busy}
          autoComplete="new-password"
          placeholder="Gateway API Key"
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>

      {isHttp ? (
        <label className="quick-setup__check">
          <input type="checkbox" checked={acknowledged} disabled={busy} onChange={(event) => setAcknowledged(event.target.checked)} />
          <span>{messages.acknowledgeInsecureGateway}</span>
        </label>
      ) : null}

      {shownError ? <p className="quick-setup__error" role="alert">{shownError}</p> : null}

      <div className="quick-setup__actions">
        <button className="quick-setup__link" type="button" onClick={onOpenSettings}>{messages.quickSetupAdvanced}</button>
        <button className="quick-setup__submit" type="submit" disabled={busy}>
          {busy ? <span className="quick-setup__spinner" aria-hidden="true" /> : null}
          {busy ? messages.quickSetupConnecting : messages.quickSetupConnect}
        </button>
      </div>
      <p className="quick-setup__note">{messages.secretStorageHint}</p>
    </form>
  );
}

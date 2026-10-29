import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { analyzeGatewayBaseUrl } from '../../core/permissions/gateway-origin';
import { normalizeError } from '../../shared/errors/app-error';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { localizeError } from '../../shared/i18n/locale';
import { sanitizeCustomHeaders } from '../../shared/redaction/header-policy';
import {
  DEFAULT_ANTHROPIC_MAX_TOKENS,
  DEFAULT_PROVIDER_BASE_URLS,
  PROVIDER_ENDPOINT_MODES,
  type ConnectionTestResult,
  type ProviderConfigDraft,
  type ProviderConfigSubmission,
  type ProviderType,
} from '../../shared/types/provider';
import { Select } from '../ui/Select';
import { ModelCombobox } from './ModelCombobox';
import { SecretField } from './SecretField';

/** Result of a save or key removal, rendered right above the form actions. */
export interface GatewayFormNotice {
  kind: 'success' | 'error';
  text: string;
  action: 'save' | 'remove-secret';
}

interface GatewayFormProps {
  initialConfig?: ProviderConfigDraft;
  hasApiKey?: boolean;
  busy?: boolean;
  busyAction?: 'models' | 'test' | 'save';
  notice?: GatewayFormNotice;
  onListModels?(submission: ProviderConfigSubmission): Promise<string[]>;
  onTest?(submission: ProviderConfigSubmission): Promise<ConnectionTestResult>;
  onSubmit(submission: ProviderConfigSubmission): Promise<void> | void;
  onRemoveSecret(): Promise<void> | void;
}

type FormErrors = Partial<Record<'name' | 'baseURL' | 'model' | 'headers' | 'transport', string>>;
type ValidationMode = 'models' | 'test' | 'save';

const EMPTY_CONFIG: ProviderConfigDraft = {
  id: 'gateway-main',
  name: '',
  type: 'openai-compatible',
  baseURL: DEFAULT_PROVIDER_BASE_URLS['openai-compatible'],
  model: '',
  endpointMode: 'chat-completions',
  defaultHeaders: {},
  timeoutMs: 30_000,
  stream: true,
};

function ModelsIcon() {
  return (
    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="5.5" rx="7" ry="3" />
      <path d="M5 5.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
      <path d="M5 10.5v5c0 1.7 3.1 3 7 3 1 0 2-.1 2.8-.3" />
      <path d="m17 16 2 2 3-4" />
    </svg>
  );
}

function TestConnectionIcon() {
  return (
    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12h3l2-5 4 10 2-5h5" />
      <path d="M20 7.5a8.5 8.5 0 1 0 0 9" />
    </svg>
  );
}

function LoadingSpinner() {
  return <span className="button-spinner" aria-hidden="true" />;
}

function SavedIcon() {
  return (
    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

const SAVED_FLASH_MS = 2000;

export function GatewayForm({
  initialConfig,
  hasApiKey = false,
  busy = false,
  busyAction,
  notice,
  onListModels,
  onTest,
  onSubmit,
  onRemoveSecret,
}: GatewayFormProps) {
  const { locale, messages } = useI18n();
  const seed = initialConfig ?? EMPTY_CONFIG;
  const [providerType, setProviderType] = useState<ProviderType>(seed.type);
  const [name, setName] = useState(seed.name);
  const [baseURL, setBaseURL] = useState(seed.baseURL);
  const [model, setModel] = useState(seed.model);
  const [models, setModels] = useState<string[]>([]);
  const [modelStatus, setModelStatus] = useState<string>();
  const [testStatus, setTestStatus] = useState<{ kind: 'success' | 'error'; text: string }>();
  const [apiKey, setApiKey] = useState('');
  const [headersText, setHeadersText] = useState(JSON.stringify(seed.defaultHeaders, null, 2));
  const [timeoutMs, setTimeoutMs] = useState(String(seed.timeoutMs));
  const [temperature, setTemperature] = useState(seed.temperature === undefined ? '' : String(seed.temperature));
  const [maxOutputTokens, setMaxOutputTokens] = useState(seed.maxOutputTokens === undefined ? '' : String(seed.maxOutputTokens));
  const [acknowledged, setAcknowledged] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!notice) return undefined;
    // The latest outcome wins the shared status slot above the actions.
    setTestStatus(undefined);
    if (notice.kind !== 'success' || notice.action !== 'save') return undefined;
    setSavedFlash(true);
    const timer = window.setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!initialConfig) return;
    setProviderType(initialConfig.type);
    setName(initialConfig.name);
    setBaseURL(initialConfig.baseURL);
    setModel(initialConfig.model);
    setHeadersText(JSON.stringify(initialConfig.defaultHeaders, null, 2));
    setTimeoutMs(String(initialConfig.timeoutMs));
    setTemperature(initialConfig.temperature === undefined ? '' : String(initialConfig.temperature));
    setMaxOutputTokens(initialConfig.maxOutputTokens === undefined ? '' : String(initialConfig.maxOutputTokens));
  }, [initialConfig]);

  const transport = useMemo(() => {
    if (!baseURL.trim()) return undefined;
    try { return analyzeGatewayBaseUrl(baseURL).transport; } catch { return undefined; }
  }, [baseURL]);
  const isHttp = transport === 'insecure-local' || transport === 'insecure-remote';
  const isAnthropic = providerType === 'anthropic-messages';

  function changeProviderType(next: ProviderType) {
    if (next === providerType) return;
    // Swap the Base URL only while it is still the other format's default, so a custom gateway URL is kept.
    const trimmed = baseURL.trim();
    if (!trimmed || trimmed === DEFAULT_PROVIDER_BASE_URLS[providerType]) {
      setBaseURL(DEFAULT_PROVIDER_BASE_URLS[next]);
      setAcknowledged(false);
    }
    setProviderType(next);
    setModels([]);
    setModelStatus(undefined);
    setTestStatus(undefined);
  }

  function buildSubmission(mode: ValidationMode): ProviderConfigSubmission | undefined {
    const nextErrors: FormErrors = {};
    if (mode === 'save' && !name.trim()) nextErrors.name = messages.validationNameRequired;
    if (mode !== 'models' && !model.trim()) nextErrors.model = messages.validationModelRequired;

    try {
      analyzeGatewayBaseUrl(baseURL);
    } catch {
      nextErrors.baseURL = messages.validationBaseUrl;
    }

    let defaultHeaders: Record<string, string> = {};
    try {
      const parsed = headersText.trim() ? JSON.parse(headersText) as unknown : {};
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('not-object');
      defaultHeaders = sanitizeCustomHeaders(parsed as Record<string, string>);
    } catch (error) {
      nextErrors.headers = locale === 'zh-CN' && error instanceof Error && error.message.startsWith('不允许覆盖请求头：')
        ? error.message
        : messages.validationHeaders;
    }
    if (isHttp && !acknowledged) nextErrors.transport = messages.validationInsecureAck;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return undefined;

    const parsedTimeout = Number(timeoutMs);
    const parsedTemperature = temperature === '' ? undefined : Number(temperature);
    const parsedMaxTokens = maxOutputTokens === '' ? undefined : Number(maxOutputTokens);
    const config: ProviderConfigDraft = {
      id: seed.id,
      name: name.trim(),
      type: providerType,
      baseURL: baseURL.trim(),
      model: model.trim(),
      endpointMode: PROVIDER_ENDPOINT_MODES[providerType],
      defaultHeaders,
      timeoutMs: Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 30_000,
      stream: true,
      ...(parsedTemperature === undefined || !Number.isFinite(parsedTemperature) ? {} : { temperature: parsedTemperature }),
      ...(parsedMaxTokens === undefined || !Number.isInteger(parsedMaxTokens) || parsedMaxTokens <= 0 ? {} : { maxOutputTokens: parsedMaxTokens }),
    };
    return {
      config,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      acknowledgeInsecureTransport: acknowledged,
    };
  }

  const shownStatus = testStatus ?? notice;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const submission = buildSubmission('save');
    if (!submission) return;
    setTestStatus(undefined);
    await onSubmit(submission);
  }

  async function handleListModels() {
    const submission = buildSubmission('models');
    if (!submission || !onListModels) return;
    setModelStatus(undefined);
    try {
      const loaded = await onListModels(submission);
      setModels(loaded);
      setModelStatus(loaded.length ? messages.fetchedModels(loaded.length) : messages.noModelsReturned);
    } catch (error) {
      setModelStatus(localizeError(normalizeError(error), messages));
    }
  }

  async function handleTest() {
    const submission = buildSubmission('test');
    if (!submission || !onTest) return;
    setTestStatus(undefined);
    try {
      const result = await onTest(submission);
      setTestStatus({
        kind: 'success',
        text: result.latencyMs === undefined ? result.message : messages.gatewayTestSucceeded(result.message, result.latencyMs),
      });
    } catch (error) {
      setTestStatus({ kind: 'error', text: localizeError(normalizeError(error), messages) });
    }
  }

  async function removeSecret() {
    if (!window.confirm(messages.removeSecretConfirm)) return;
    await onRemoveSecret();
  }

  return (
    <form className="settings-card gateway-form" onSubmit={handleSubmit} noValidate>
      <div className="card-heading">
        <div>
          <p className="eyebrow">{messages.modelConnection}</p>
          <h2>{messages.gatewayKind}</h2>
          <p>{messages.gatewayDescription}</p>
        </div>
        <span className="provider-pill">{isAnthropic ? messages.gatewayAnthropicLabel : messages.gatewayCompatibleLabel}</span>
      </div>

      <div className="field-group">
        <Select
          id="gateway-api-format"
          className="field-select"
          label={messages.apiFormat}
          value={providerType}
          disabled={busy}
          options={[
            { value: 'openai-compatible', label: messages.apiFormatOpenAI },
            { value: 'anthropic-messages', label: messages.apiFormatAnthropic },
          ]}
          onChange={changeProviderType}
        />
        <span className="field-hint">{messages.apiFormatHint}</span>
      </div>

      <div className="field-group">
        <label htmlFor="gateway-name">{messages.configurationName}</label>
        <input id="gateway-name" value={name} disabled={busy} onChange={(event) => setName(event.target.value)} placeholder={messages.namePlaceholder} aria-invalid={Boolean(errors.name)} />
        {errors.name && <span className="field-error">{errors.name}</span>}
      </div>

      <div className="field-group">
        <label htmlFor="gateway-model">{messages.modelName}</label>
        <div className="model-input-row">
          <ModelCombobox id="gateway-model" value={model} models={models} disabled={busy} invalid={Boolean(errors.model)} onChange={setModel} />
          <button className="secondary-button model-fetch-button" type="button" disabled={busy || !onListModels} onClick={() => void handleListModels()}>
            {busyAction === 'models' ? <LoadingSpinner /> : <ModelsIcon />}
            <span>{busyAction === 'models' ? messages.fetchingModels : messages.fetchModels}</span>
          </button>
        </div>
        {modelStatus && <span className="field-hint" role="status">{modelStatus}</span>}
        {errors.model && <span className="field-error">{errors.model}</span>}
      </div>

      <div className="field-group">
        <label htmlFor="gateway-url">{messages.baseUrl}</label>
        <input id="gateway-url" inputMode="url" value={baseURL} disabled={busy} onChange={(event) => { setBaseURL(event.target.value); setAcknowledged(false); setModels([]); setModelStatus(undefined); setTestStatus(undefined); }} placeholder={DEFAULT_PROVIDER_BASE_URLS[providerType]} aria-invalid={Boolean(errors.baseURL)} />
        {errors.baseURL && <span className="field-error">{errors.baseURL}</span>}
        {isHttp && (
          <div className="inline-warning" role="alert">
            <strong>{messages.insecureGatewayTitle}</strong>
            <span>{transport === 'insecure-local' ? messages.insecureLocalDescription : messages.insecureRemoteDescription}</span>
            <label className="check-row">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              {messages.acknowledgeInsecureGateway}
            </label>
            {errors.transport && <span className="field-error">{errors.transport}</span>}
          </div>
        )}
      </div>

      <SecretField value={apiKey} onChange={setApiKey} hasStoredSecret={hasApiKey} disabled={busy} onRemove={removeSecret} />

      <div className="field-group">
        <label htmlFor="custom-headers">{messages.customHeadersLabel}</label>
        <textarea id="custom-headers" value={headersText} disabled={busy} onChange={(event) => setHeadersText(event.target.value)} rows={4} spellCheck={false} aria-invalid={Boolean(errors.headers)} />
        <span className="field-hint">{messages.protectedHeadersHint}</span>
        {errors.headers && <span className="field-error">{errors.headers}</span>}
      </div>

      <details className="advanced-settings">
        <summary>{messages.advancedParameters}</summary>
        <div className="form-grid form-grid--three">
          <div className="field-group">
            <label htmlFor="timeout">{messages.timeout}</label>
            <input id="timeout" type="number" min="1000" step="1000" value={timeoutMs} disabled={busy} onChange={(event) => setTimeoutMs(event.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="temperature">{messages.temperature}</label>
            <input id="temperature" type="number" min="0" max={isAnthropic ? '1' : '2'} step="0.1" value={temperature} disabled={busy} onChange={(event) => setTemperature(event.target.value)} placeholder={messages.gatewayDefault} />
          </div>
          <div className="field-group">
            <label htmlFor="max-tokens">{messages.maxOutputTokens}</label>
            <input id="max-tokens" type="number" min="1" step="1" value={maxOutputTokens} disabled={busy} onChange={(event) => setMaxOutputTokens(event.target.value)} placeholder={isAnthropic ? messages.anthropicMaxTokensDefault(DEFAULT_ANTHROPIC_MAX_TOKENS) : messages.gatewayDefault} />
          </div>
        </div>
      </details>

      {shownStatus && (
        <div key={shownStatus.text} className={`connection-status connection-status--${shownStatus.kind}`} role="status">
          <span aria-hidden="true" />{shownStatus.text}
        </div>
      )}

      <div className="form-actions">
        <div className="privacy-note"><span aria-hidden="true">◆</span> {messages.exactOriginPermission}</div>
        <div className="gateway-action-buttons">
          <button className="secondary-button gateway-test-button" type="button" disabled={busy || !onTest} onClick={() => void handleTest()}>
            {busyAction === 'test' ? <LoadingSpinner /> : <TestConnectionIcon />}
            <span>{busyAction === 'test' ? messages.testingGateway : messages.testGateway}</span>
          </button>
          <button className={`primary-button gateway-save-button${savedFlash ? ' primary-button--saved' : ''}`} type="submit" disabled={busy}>
            {busyAction === 'save' ? <LoadingSpinner /> : savedFlash ? <SavedIcon /> : null}
            <span>{busyAction === 'save' ? messages.savingConfiguration : savedFlash ? messages.configurationSavedShort : messages.saveConfiguration}</span>
          </button>
        </div>
      </div>
    </form>
  );
}

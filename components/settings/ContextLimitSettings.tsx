import { useEffect, useRef, useState } from 'react';
import type { RuntimeCommand } from '../../messaging/contracts';
import {
  DEFAULT_CONTEXT_LIMITS,
  DOCUMENT_CONTEXT_CHARACTER_OPTIONS,
} from '../../shared/constants/context-limits';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { Select } from '../ui/Select';

interface ContextLimitSettingsProps {
  runtime: { send(command: RuntimeCommand): Promise<unknown> };
}

interface ContextLimitResponse {
  documentCharacters: number;
}

function requestId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ContextLimitSettings({ runtime }: ContextLimitSettingsProps) {
  const { messages } = useI18n();
  const [documentCharacters, setDocumentCharacters] = useState(DEFAULT_CONTEXT_LIMITS.documentCharacters);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const valueRef = useRef(documentCharacters);
  valueRef.current = documentCharacters;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void runtime.send({
      version: 1,
      requestId: requestId('get-context-limit'),
      type: 'GET_CONTEXT_LIMIT',
    }).then((response) => {
      if (!active) return;
      const value = (response as ContextLimitResponse).documentCharacters;
      if (DOCUMENT_CONTEXT_CHARACTER_OPTIONS.some((option) => option === value)) {
        setDocumentCharacters(value);
      }
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [runtime]);

  async function changeLimit(nextValue: number) {
    const previousValue = valueRef.current;
    setDocumentCharacters(nextValue);
    setSaving(true);
    setError(false);
    try {
      const response = await runtime.send({
        version: 1,
        requestId: requestId('set-context-limit'),
        type: 'SET_CONTEXT_LIMIT',
        documentCharacters: nextValue,
      }) as ContextLimitResponse;
      setDocumentCharacters(response.documentCharacters);
    } catch {
      setDocumentCharacters(previousValue);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="context-limit-settings" aria-labelledby="context-limit-settings-title">
      <div className="context-limit-settings__copy">
        <h3 id="context-limit-settings-title">{messages.pageContextLimit}</h3>
        <p>{messages.pageContextLimitDescription}</p>
      </div>
      <Select
        className="context-limit-settings__control"
        ariaLabel={messages.pageContextLimit}
        value={String(documentCharacters)}
        disabled={loading || saving}
        options={DOCUMENT_CONTEXT_CHARACTER_OPTIONS.map((characters) => ({
          value: String(characters),
          label: characters === DEFAULT_CONTEXT_LIMITS.documentCharacters
            ? messages.pageContextLimitDefaultOption(characters)
            : messages.pageContextLimitOption(characters),
        }))}
        onChange={(next) => void changeLimit(Number(next))}
      />
      {error && (
        <p className="context-limit-settings__error" role="alert">
          {messages.pageContextLimitSettingError}
        </p>
      )}
    </section>
  );
}

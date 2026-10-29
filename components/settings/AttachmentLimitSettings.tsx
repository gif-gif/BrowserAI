import { useEffect, useRef, useState } from 'react';
import type { RuntimeCommand } from '../../messaging/contracts';
import {
  ATTACHMENT_MAX_BYTE_OPTIONS,
  BYTES_PER_MEGABYTE,
  DEFAULT_ATTACHMENT_MAX_BYTES,
} from '../../shared/constants/attachment-limits';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { Select } from '../ui/Select';

interface AttachmentLimitSettingsProps {
  runtime: { send(command: RuntimeCommand): Promise<unknown> };
  onChanged?(attachmentMaxBytes: number): void;
}

interface AttachmentLimitResponse {
  attachmentMaxBytes: number;
}

function requestId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AttachmentLimitSettings({ runtime, onChanged }: AttachmentLimitSettingsProps) {
  const { messages } = useI18n();
  const [attachmentMaxBytes, setAttachmentMaxBytes] = useState(DEFAULT_ATTACHMENT_MAX_BYTES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const valueRef = useRef(attachmentMaxBytes);
  valueRef.current = attachmentMaxBytes;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void runtime.send({
      version: 1,
      requestId: requestId('get-attachment-limit'),
      type: 'GET_ATTACHMENT_LIMIT',
    }).then((response) => {
      if (!active) return;
      const value = (response as AttachmentLimitResponse).attachmentMaxBytes;
      if (ATTACHMENT_MAX_BYTE_OPTIONS.some((option) => option === value)) {
        setAttachmentMaxBytes(value);
        onChanged?.(value);
      }
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [onChanged, runtime]);

  async function changeLimit(nextValue: number) {
    const previousValue = valueRef.current;
    setAttachmentMaxBytes(nextValue);
    setSaving(true);
    setError(false);
    try {
      const response = await runtime.send({
        version: 1,
        requestId: requestId('set-attachment-limit'),
        type: 'SET_ATTACHMENT_LIMIT',
        attachmentMaxBytes: nextValue,
      }) as AttachmentLimitResponse;
      setAttachmentMaxBytes(response.attachmentMaxBytes);
      onChanged?.(response.attachmentMaxBytes);
    } catch {
      setAttachmentMaxBytes(previousValue);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="attachment-limit-settings" aria-labelledby="attachment-limit-settings-title">
      <div className="attachment-limit-settings__copy">
        <h3 id="attachment-limit-settings-title">{messages.attachmentSizeLimit}</h3>
        <p>{messages.attachmentSizeLimitDescription}</p>
      </div>
      <Select
        className="attachment-limit-settings__control"
        ariaLabel={messages.attachmentSizeLimit}
        value={String(attachmentMaxBytes)}
        disabled={loading || saving}
        options={ATTACHMENT_MAX_BYTE_OPTIONS.map((bytes) => {
          const megabytes = bytes / BYTES_PER_MEGABYTE;
          return {
            value: String(bytes),
            label: bytes === DEFAULT_ATTACHMENT_MAX_BYTES
              ? messages.attachmentSizeLimitDefaultOption(megabytes)
              : messages.attachmentSizeLimitOption(megabytes),
          };
        })}
        onChange={(next) => void changeLimit(Number(next))}
      />
      {error && (
        <p className="attachment-limit-settings__error" role="alert">
          {messages.attachmentSizeLimitSettingError}
        </p>
      )}
    </section>
  );
}

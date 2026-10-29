import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { RuntimeClient } from '../../messaging/runtime-client';
import { AppError } from '../../shared/errors/app-error';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { localizeError } from '../../shared/i18n/locale';
import type { AppLocale } from '../../shared/i18n/messages';
import { WRITING_TONES, type WritingTone } from '../../shared/types/writing-assistant';
import { Select } from '../ui/Select';

/** Mirrors the AI_WRITING_ASSIST contract limits. */
const MAX_TEXT_LENGTH = 20_000;
const MAX_INSTRUCTION_LENGTH = 1_000;

export interface WritingRequest {
  text: string;
  tone: WritingTone;
  instruction?: string;
  model?: string;
  locale: AppLocale;
}

interface WritingAssistantDialogProps {
  /** Prefills the text field, usually with the current composer draft. */
  initialText?: string;
  /** Preselected model; omitted or unknown falls back to the Gateway default. */
  model?: string;
  /** Models the user can pick for this polish request. */
  models?: readonly string[];
  /** Puts the polished text into the chat input. */
  onUse?: (text: string) => void;
  onClose: () => void;
  /** Polishes the text with AI; defaults to the background writing assistant. */
  rewrite?: (request: WritingRequest) => Promise<string>;
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `writing-dialog-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createDefaultRewriter(): WritingAssistantDialogProps['rewrite'] {
  if (typeof browser === 'undefined' || !browser.runtime) return undefined;
  const runtime = new RuntimeClient(browser.runtime);
  // The Gateway request runs in the background; this page only sends the text.
  return async ({ text, tone, instruction, model, locale }) => {
    const result = await runtime.send<{ text: string }>({
      version: 1,
      requestId: createRequestId(),
      type: 'AI_WRITING_ASSIST',
      text,
      tone,
      locale,
      ...(instruction ? { instruction } : {}),
      ...(model ? { model } : {}),
    });
    return result.text;
  };
}

export function WritingAssistantDialog({ initialText = '', model, models = [], onUse, onClose, rewrite }: WritingAssistantDialogProps) {
  const { messages, locale } = useI18n();
  const titleId = useId();
  const textId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(initialText.slice(0, MAX_TEXT_LENGTH));
  const [tone, setTone] = useState<WritingTone>('polish');
  const [selectedModel, setSelectedModel] = useState(model && models.includes(model) ? model : '');
  const [instruction, setInstruction] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState<string>();
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const rewriter = useMemo(() => rewrite ?? createDefaultRewriter(), [rewrite]);

  const toneLabels: Record<WritingTone, string> = {
    polish: messages.writingTonePolish,
    professional: messages.writingToneProfessional,
    friendly: messages.writingToneFriendly,
    concise: messages.writingToneConcise,
  };
  const toneOptions = WRITING_TONES.map((value) => ({ value, label: toneLabels[value] }));
  // '' keeps the request model-less so the background uses the Gateway default.
  const modelOptions = [{ value: '', label: messages.gatewayDefault }, ...models.map((value) => ({ value, label: value }))];

  useEffect(() => { textRef.current?.focus(); }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!rewriter || generating) return;
    if (!text.trim()) {
      setError(messages.writingAssistantEmpty);
      return;
    }
    setGenerating(true);
    setError(undefined);
    setCopied(false);
    try {
      const polished = (await rewriter({
        text: text.trim(),
        tone,
        instruction: instruction.trim() || undefined,
        model: selectedModel || undefined,
        locale,
      })).trim();
      setResult(polished);
    } catch (cause) {
      setError(cause instanceof AppError ? localizeError(cause, messages) : messages.errors.UNKNOWN);
    } finally {
      setGenerating(false);
    }
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
    } catch {
      setError(messages.copyFailed);
    }
  }

  return (
    <div className="skill-dialog-overlay">
      <div className="skill-dialog-scrim" aria-hidden="true" onClick={onClose} />
      <form className="skill-dialog writing-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={(event) => { void submit(event); }}>
        <h2 id={titleId}>{messages.writingAssistantTitle}</h2>
        <p className="writing-dialog__description">{messages.writingAssistantDescription}</p>
        <div className="skill-dialog__field">
          <label htmlFor={textId}>{messages.writingAssistantOriginal}</label>
          <textarea
            id={textId}
            ref={textRef}
            className="writing-dialog__input"
            value={text}
            rows={3}
            maxLength={MAX_TEXT_LENGTH}
            placeholder={messages.writingAssistantInputPlaceholder}
            readOnly={generating}
            onChange={(event) => { setText(event.target.value); setError(undefined); }}
          />
        </div>
        <div className="writing-dialog__row">
          <Select<WritingTone> ariaLabel={messages.writingAssistantTone} value={tone} options={toneOptions} disabled={generating} onChange={setTone} />
          <Select
            ariaLabel={messages.model}
            value={selectedModel}
            options={modelOptions}
            disabled={generating}
            search={{ placeholder: messages.modelSearchPlaceholder, noMatch: messages.modelSearchNoMatch }}
            onChange={setSelectedModel}
          />
        </div>
        <label className="skill-dialog__field">
          <span>{messages.writingAssistantContext}</span>
          <input
            value={instruction}
            maxLength={MAX_INSTRUCTION_LENGTH}
            placeholder={messages.writingAssistantContextPlaceholder}
            readOnly={generating}
            onChange={(event) => setInstruction(event.target.value)}
          />
        </label>
        {result ? (
          <section className="writing-dialog__result" aria-label={messages.writingAssistantResult} aria-live="polite">
            <h3>{messages.writingAssistantResult}</h3>
            <p>{result}</p>
          </section>
        ) : null}
        {generating ? <p className="skill-dialog__status" role="status">{messages.writingAssistantGenerating}</p> : null}
        {error ? <p className="skill-dialog__error" role="alert">{error}</p> : null}
        <div className="skill-dialog__actions">
          {result ? (
            <>
              <button type="button" className="writing-dialog__copy" disabled={generating} onClick={() => { void copyResult(); }}>
                {copied ? messages.copied : messages.copy}
              </button>
              {onUse ? (
                <button type="button" disabled={generating} onClick={() => { onUse(result); onClose(); }}>
                  {messages.writingAssistantUseInComposer}
                </button>
              ) : null}
            </>
          ) : (
            <button type="button" onClick={onClose}>{messages.cancel}</button>
          )}
          <button type="submit" className="skill-dialog__save" disabled={generating || !rewriter}>
            {generating ? messages.writingAssistantGenerating : messages.writingAssistantGenerate}
          </button>
        </div>
      </form>
    </div>
  );
}

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { RuntimeClient } from '../../messaging/runtime-client';
import { AppError } from '../../shared/errors/app-error';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { localizeError } from '../../shared/i18n/locale';
import type { AppLocale } from '../../shared/i18n/messages';
import { WRITING_TONES, type WritingTone } from '../../shared/types/writing-assistant';
import type { Skill, SkillInvocation } from '../../shared/types/skill';
import { Select } from '../ui/Select';

/** Mirrors the AI_WRITING_ASSIST contract limits. */
const MAX_TEXT_LENGTH = 20_000;
const MAX_INSTRUCTION_LENGTH = 1_000;
const SKILL_STYLE_PREFIX = 'skill:';
/** Results shown before the list starts scrolling. */
const VISIBLE_RESULTS = 3;

export interface WritingRequest {
  text: string;
  tone: WritingTone;
  /** A user skill picked from the tone menu; its instructions replace the tone. */
  skill?: SkillInvocation;
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
  /** User “/” skills offered under the tones in the style menu. */
  skills?: readonly Skill[];
  /** Puts the polished text into the chat input. */
  onUse?: (text: string) => void;
  onClose: () => void;
  /** Polishes the text with AI; defaults to the background writing assistant. */
  rewrite?: (request: WritingRequest) => Promise<string>;
}

interface WritingResult {
  id: string;
  text: string;
  tone: WritingTone;
  skillName?: string;
  model?: string;
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `writing-dialog-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createDefaultRewriter(): WritingAssistantDialogProps['rewrite'] {
  if (typeof browser === 'undefined' || !browser.runtime) return undefined;
  const runtime = new RuntimeClient(browser.runtime);
  // The Gateway request runs in the background; this page only sends the text.
  return async ({ text, tone, skill, instruction, model, locale }) => {
    const result = await runtime.send<{ text: string }>({
      version: 1,
      requestId: createRequestId(),
      type: 'AI_WRITING_ASSIST',
      text,
      tone,
      locale,
      ...(skill ? { skill } : {}),
      ...(instruction ? { instruction } : {}),
      ...(model ? { model } : {}),
    });
    return result.text;
  };
}

export function WritingAssistantDialog({ initialText = '', model, models = [], skills = [], onUse, onClose, rewrite }: WritingAssistantDialogProps) {
  const { messages, locale } = useI18n();
  const titleId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(initialText.slice(0, MAX_TEXT_LENGTH));
  // A tone id, or `skill:<id>` for a user skill listed under the tones.
  const [style, setStyle] = useState<string>('polish');
  const [selectedModel, setSelectedModel] = useState(model && models.includes(model) ? model : '');
  const [instruction, setInstruction] = useState('');
  // Newest first; every polish is kept so the user can pick any of them.
  const [results, setResults] = useState<WritingResult[]>([]);
  const [error, setError] = useState<string>();
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string>();
  const resultListRef = useRef<HTMLDivElement>(null);
  const [resultListHeight, setResultListHeight] = useState<number>();
  const rewriter = useMemo(() => rewrite ?? createDefaultRewriter(), [rewrite]);

  const toneLabels: Record<WritingTone, string> = {
    polish: messages.writingTonePolish,
    professional: messages.writingToneProfessional,
    friendly: messages.writingToneFriendly,
    concise: messages.writingToneConcise,
  };
  const styleOptions = [
    ...WRITING_TONES.map((value) => ({ value: value as string, label: toneLabels[value] })),
    ...skills.map((skill, index) => ({ value: `${SKILL_STYLE_PREFIX}${skill.id}`, label: skill.name, separatorBefore: index === 0 })),
  ];
  const selectedSkill = style.startsWith(SKILL_STYLE_PREFIX)
    ? skills.find((skill) => `${SKILL_STYLE_PREFIX}${skill.id}` === style)
    : undefined;
  const tone: WritingTone = (WRITING_TONES as readonly string[]).includes(style) ? style as WritingTone : 'polish';

  // A skill deleted elsewhere while the dialog is open falls back to the default tone.
  useEffect(() => {
    if (style.startsWith(SKILL_STYLE_PREFIX) && !selectedSkill) setStyle('polish');
  }, [selectedSkill, style]);
  // '' keeps the request model-less so the background uses the Gateway default.
  const modelOptions = [{ value: '', label: messages.gatewayDefault }, ...models.map((value) => ({ value, label: value }))];

  useEffect(() => { textRef.current?.focus(); }, []);

  // Results differ in length, so the cap is measured: the list ends at the
  // bottom of the third result and scrolls for anything after it.
  useLayoutEffect(() => {
    const list = resultListRef.current;
    const last = list?.children[VISIBLE_RESULTS - 1] as HTMLElement | undefined;
    if (!list || results.length <= VISIBLE_RESULTS || !last) {
      setResultListHeight(undefined);
      return;
    }
    const first = list.children[0] as HTMLElement;
    setResultListHeight(last.getBoundingClientRect().bottom - first.getBoundingClientRect().top);
  }, [results]);

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
    try {
      const polished = (await rewriter({
        text: text.trim(),
        tone,
        ...(selectedSkill ? { skill: { name: selectedSkill.name, prompt: selectedSkill.prompt } } : {}),
        instruction: instruction.trim() || undefined,
        model: selectedModel || undefined,
        locale,
      })).trim();
      setResults((current) => [
        { id: createRequestId(), text: polished, tone, ...(selectedSkill ? { skillName: selectedSkill.name } : {}), ...(selectedModel ? { model: selectedModel } : {}) },
        ...current,
      ]);
      resultListRef.current?.scrollTo?.({ top: 0 });
    } catch (cause) {
      setError(cause instanceof AppError ? localizeError(cause, messages) : messages.errors.UNKNOWN);
    } finally {
      setGenerating(false);
    }
  }

  async function copyResult(item: WritingResult) {
    try {
      await navigator.clipboard.writeText(item.text);
      setCopiedId(item.id);
    } catch {
      setError(messages.copyFailed);
    }
  }

  return (
    <div className="skill-dialog-overlay">
      <div className="skill-dialog-scrim" aria-hidden="true" onClick={onClose} />
      <form className="skill-dialog writing-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={(event) => { void submit(event); }}>
        <div className="writing-dialog__header">
          <h2 id={titleId}>
            <img className="writing-dialog__logo" src={new URL('/icon/128.png', window.location.href).href} alt="" aria-hidden="true" />
            {messages.writingAssistantTitle}
          </h2>
          <button type="button" className="writing-dialog__close" aria-label={messages.writingAssistantClose} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <p className="writing-dialog__description">{messages.writingAssistantDescription}</p>
        <div className="skill-dialog__field">
          <textarea
            ref={textRef}
            aria-label={messages.writingAssistantOriginal}
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
          <Select ariaLabel={messages.writingAssistantTone} value={style} options={styleOptions} disabled={generating} onChange={setStyle} />
          <Select
            ariaLabel={messages.model}
            value={selectedModel}
            options={modelOptions}
            disabled={generating}
            search={{ placeholder: messages.modelSearchPlaceholder, noMatch: messages.modelSearchNoMatch }}
            onChange={setSelectedModel}
          />
        </div>
        <div className="skill-dialog__field">
          {/* The context box doubles as the composer: Enter or the arrow starts a polish. */}
          <div className="writing-dialog__composer">
            <input
              value={instruction}
              maxLength={MAX_INSTRUCTION_LENGTH}
              aria-label={messages.writingAssistantContext}
              placeholder={messages.writingAssistantContext}
              readOnly={generating}
              onChange={(event) => setInstruction(event.target.value)}
            />
            <button
              type="submit"
              className="writing-dialog__submit"
              aria-label={generating ? messages.writingAssistantGenerating : messages.writingAssistantGenerate}
              aria-busy={generating}
              disabled={generating || !rewriter}
            >
              {generating
                ? <span className="writing-dialog__spinner" aria-hidden="true" />
                : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M14 7l5 5-5 5" /></svg>}
            </button>
          </div>
        </div>
        {error ? <p className="skill-dialog__error" role="alert">{error}</p> : null}
        {results.length ? (
          <div
            ref={resultListRef}
            className="writing-dialog__results"
            style={resultListHeight === undefined ? undefined : { maxHeight: resultListHeight }}
            data-scrollable={results.length > VISIBLE_RESULTS || undefined}
            role="list" aria-label={messages.writingAssistantResult} aria-live="polite">
            {results.map((item) => (
              <section key={item.id} className="writing-dialog__result" role="listitem" aria-label={messages.writingAssistantResult}>
                <div className="writing-dialog__result-header">
                  {/* The section is already labelled 润色结果; the header shows what produced it. */}
                  <div className="writing-dialog__result-meta">
                    <span className="writing-dialog__result-tone">{item.skillName ?? toneLabels[item.tone]}</span>
                    {item.model ? <span className="writing-dialog__result-model" title={item.model}>{item.model}</span> : null}
                  </div>
                  <div className="writing-dialog__result-actions">
                    {onUse ? (
                      <button type="button" className="writing-dialog__insert" disabled={generating} onClick={() => { onUse(item.text); onClose(); }}>
                        {messages.writingAssistantInsert}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="writing-dialog__icon-action"
                      aria-label={copiedId === item.id ? messages.copied : messages.copy}
                      title={copiedId === item.id ? messages.copied : messages.copy}
                      data-copied={copiedId === item.id || undefined}
                      disabled={generating}
                      onClick={() => { void copyResult(item); }}
                    >
                      {copiedId === item.id
                        ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8" /></svg>
                        : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /></svg>}
                    </button>
                    <button
                      type="button"
                      className="writing-dialog__icon-action writing-dialog__delete"
                      aria-label={messages.writingAssistantDeleteResult}
                      title={messages.writingAssistantDeleteResult}
                      disabled={generating}
                      onClick={() => setResults((current) => current.filter(({ id }) => id !== item.id))}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M9 7l1-2h4l1 2M7 7l1 12h8l1-12" /></svg>
                    </button>
                  </div>
                </div>
                <p>{item.text}</p>
              </section>
            ))}
          </div>
        ) : null}
      </form>
    </div>
  );
}

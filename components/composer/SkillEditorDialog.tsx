import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { RuntimeClient } from '../../messaging/runtime-client';
import { AppError } from '../../shared/errors/app-error';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { localizeError } from '../../shared/i18n/locale';
import type { AppLocale } from '../../shared/i18n/messages';
import { validateSkill, type SkillValidationError } from '../../shared/skills/skill-store';
import { MAX_SKILL_NAME_LENGTH, MAX_SKILL_PROMPT_LENGTH, type Skill } from '../../shared/types/skill';

export interface SkillDraft {
  id?: string;
  name: string;
  prompt: string;
}

interface SkillEditorDialogProps {
  /** The skill being edited; a draft without an id creates a new skill. */
  draft: SkillDraft;
  skills: Skill[];
  onSave: (draft: SkillDraft) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  onClose: () => void;
  /** Rewrites the instructions with AI; defaults to the background writing assistant. */
  improvePrompt?: (prompt: string, locale: AppLocale) => Promise<string>;
}

/** Typing within this window is merged into one undo step, like a native text field. */
const TYPING_MERGE_MS = 800;

const IMPROVE_INSTRUCTION = 'The text is the instruction of a reusable AI prompt ("skill"). '
  + 'Make it clearer, more specific and more effective as a prompt: state the task, the expected output format and any constraints. '
  + 'Keep the original intent and language, and do not answer or execute it.';

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `improve-skill-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createDefaultImprover(): SkillEditorDialogProps['improvePrompt'] {
  if (typeof browser === 'undefined' || !browser.runtime) return undefined;
  const runtime = new RuntimeClient(browser.runtime);
  // The Gateway request runs in the background; this page only sends the draft text.
  return async (prompt, locale) => {
    const result = await runtime.send<{ text: string }>({
      version: 1,
      requestId: createRequestId(),
      type: 'AI_WRITING_ASSIST',
      text: prompt,
      instruction: IMPROVE_INSTRUCTION,
      tone: 'polish',
      locale,
    });
    return result.text;
  };
}

/** Undo/redo stack for the instructions; AI rewrites are always their own step. */
function usePromptHistory(initial: string) {
  const [state, setState] = useState({ entries: [initial], index: 0 });
  const lastTypedAt = useRef(0);
  const value = state.entries[state.index] ?? '';

  function push(next: string, merge: boolean) {
    setState(({ entries, index }) => {
      if (entries[index] === next) return { entries, index };
      const kept = entries.slice(0, merge ? index : index + 1);
      // The first entry is the original text and is never merged away.
      if (merge && index === 0) kept.push(entries[0] ?? '');
      return { entries: [...kept, next], index: kept.length };
    });
  }

  return {
    value,
    canUndo: state.index > 0,
    canRedo: state.index < state.entries.length - 1,
    type(next: string) {
      const now = Date.now();
      push(next, now - lastTypedAt.current < TYPING_MERGE_MS);
      lastTypedAt.current = now;
    },
    replace(next: string) {
      lastTypedAt.current = 0;
      push(next, false);
    },
    undo() {
      lastTypedAt.current = 0;
      setState((current) => ({ ...current, index: Math.max(0, current.index - 1) }));
    },
    redo() {
      lastTypedAt.current = 0;
      setState((current) => ({ ...current, index: Math.min(current.entries.length - 1, current.index + 1) }));
    },
  };
}

function UndoIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 5 4 8.5 7.5 12" /><path d="M4.5 8.5h7a4 4 0 0 1 0 8H9" /></svg>;
}

function RedoIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 5 16 8.5 12.5 12" /><path d="M15.5 8.5h-7a4 4 0 0 0 0 8H11" /></svg>;
}

function ImproveIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m13.6 6.4 1.8 1.8-7.7 7.7-2.6.8.8-2.6 7.7-7.7Z" />
      <path d="M6 2.5v3M4.5 4h3M15 12.5v2.5M13.75 13.75h2.5" />
    </svg>
  );
}

export function SkillEditorDialog({ draft, skills, onSave, onDelete, onClose, improvePrompt }: SkillEditorDialogProps) {
  const { messages, locale } = useI18n();
  const titleId = useId();
  const promptId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(draft.name);
  const history = usePromptHistory(draft.prompt);
  const prompt = history.value;
  const [error, setError] = useState<SkillValidationError | 'saveFailed'>();
  const [improveError, setImproveError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [improving, setImproving] = useState(false);
  const improver = useMemo(() => improvePrompt ?? createDefaultImprover(), [improvePrompt]);
  const editing = Boolean(draft.id);

  useEffect(() => { nameRef.current?.focus(); }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const errorMessages: Record<SkillValidationError | 'saveFailed', string> = {
    nameRequired: messages.skillNameRequired,
    nameInvalid: messages.skillNameInvalid,
    nameDuplicate: messages.skillNameDuplicate,
    promptRequired: messages.skillPromptRequired,
    limitReached: messages.skillLimitReached,
    saveFailed: messages.skillSaveFailed,
  };

  async function run(action: () => Promise<void> | void) {
    setBusy(true);
    try {
      await action();
      onClose();
    } catch {
      setError('saveFailed');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = validateSkill({ name, prompt }, skills, draft.id);
    if (invalid) {
      setError(invalid);
      return;
    }
    void run(() => onSave({ ...(draft.id ? { id: draft.id } : {}), name: name.trim(), prompt: prompt.trim() }));
  }

  async function improve() {
    if (!improver || !prompt.trim()) return;
    setImproving(true);
    setImproveError(undefined);
    try {
      const improved = (await improver(prompt.trim(), locale)).trim();
      if (improved) history.replace(improved.slice(0, MAX_SKILL_PROMPT_LENGTH));
    } catch (cause) {
      setImproveError(cause instanceof AppError ? localizeError(cause, messages) : messages.errors.UNKNOWN);
    } finally {
      setImproving(false);
    }
  }

  // React-controlled values lose the native undo stack, so route the shortcuts to ours.
  function handlePromptKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      history.undo();
    } else if ((key === 'z' && event.shiftKey) || key === 'y') {
      event.preventDefault();
      history.redo();
    }
  }

  const locked = busy || improving;

  return (
    <div className="skill-dialog-overlay">
      <div className="skill-dialog-scrim" aria-hidden="true" onClick={onClose} />
      <form className="skill-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit}>
        <h2 id={titleId}>{editing ? messages.editSkillTitle : messages.addSkill}</h2>
        <label className="skill-dialog__field">
          <span>{messages.skillName}</span>
          <input
            ref={nameRef}
            value={name}
            maxLength={MAX_SKILL_NAME_LENGTH}
            placeholder={messages.skillNamePlaceholder}
            onChange={(event) => { setName(event.target.value); setError(undefined); }}
          />
          <small>{messages.skillNameHint}</small>
        </label>
        <div className="skill-dialog__field">
          <label htmlFor={promptId}>{messages.skillPrompt}</label>
          <div className="skill-dialog__prompt" aria-busy={improving || undefined}>
            <textarea
              id={promptId}
              value={prompt}
              rows={6}
              maxLength={MAX_SKILL_PROMPT_LENGTH}
              placeholder={messages.skillPromptPlaceholder}
              readOnly={improving}
              onKeyDown={handlePromptKeyDown}
              onChange={(event) => { history.type(event.target.value); setError(undefined); setImproveError(undefined); }}
            />
            <div className="skill-dialog__tools">
              <button type="button" aria-label={messages.undoEdit} title={messages.undoEdit} disabled={locked || !history.canUndo} onClick={history.undo}>
                <UndoIcon />
              </button>
              <button type="button" aria-label={messages.redoEdit} title={messages.redoEdit} disabled={locked || !history.canRedo} onClick={history.redo}>
                <RedoIcon />
              </button>
              {improver ? (
                <button
                  type="button"
                  className="skill-dialog__improve"
                  aria-label={messages.improveSkillPrompt}
                  title={messages.improveSkillPrompt}
                  disabled={locked || !prompt.trim()}
                  onClick={() => { void improve(); }}
                >
                  <ImproveIcon />
                </button>
              ) : null}
              {improving ? <span className="skill-dialog__status" role="status">{messages.improvingSkillPrompt}</span> : null}
            </div>
          </div>
        </div>
        {error ? <p className="skill-dialog__error" role="alert">{errorMessages[error]}</p> : null}
        {!error && improveError ? <p className="skill-dialog__error" role="alert">{improveError}</p> : null}
        <div className="skill-dialog__actions">
          {editing && onDelete ? (
            <button type="button" className="skill-dialog__delete" disabled={locked} onClick={() => { void run(() => onDelete(draft.id!)); }}>
              {messages.deleteSkill}
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={onClose}>{messages.cancel}</button>
          <button type="submit" className="skill-dialog__save" disabled={locked}>{messages.saveSkill}</button>
        </div>
      </form>
    </div>
  );
}

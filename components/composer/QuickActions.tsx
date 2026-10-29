import { useI18n } from '../../shared/i18n/I18nProvider';
import { DEFAULT_NEW_CHAT_SHORTCUTS, shortcutKey, type NewChatShortcut } from '../../shared/new-chat-shortcuts/preference';
import type { Skill } from '../../shared/types/skill';

export interface QuickAction {
  id: 'summarize' | 'explain' | 'translate' | 'tech-stack';
  label: string;
  description: string;
  prompt: string;
}

interface QuickActionsProps {
  onSelect: (action: QuickAction) => void;
  /** Runs a saved skill chosen as a shortcut in settings. */
  onSelectSkill?: (skill: Skill) => void;
  /** The buttons chosen in settings; defaults to the four quick actions. */
  shortcuts?: NewChatShortcut[];
  skills?: Skill[];
  disabled?: boolean;
}

export interface ShortcutButton {
  key: string;
  label: string;
  title?: string;
  run: () => void;
}

/**
 * Resolves the shortcuts chosen in settings to runnable buttons. Shared by the
 * new-chat buttons and the “+” menu's shortcut submenu.
 */
export function resolveShortcutButtons(
  shortcuts: NewChatShortcut[],
  quickActions: QuickAction[],
  skills: Skill[],
  onSelect: (action: QuickAction) => void,
  onSelectSkill?: (skill: Skill) => void,
): ShortcutButton[] {
  // The same shortcut may appear twice, so keys include the slot position.
  return shortcuts.flatMap((shortcut, index): ShortcutButton[] => {
    if (shortcut.type === 'action') {
      const action = quickActions.find((item) => item.id === shortcut.id);
      return action ? [{ key: `${index}:${shortcutKey(shortcut)}`, label: action.label, title: action.description, run: () => onSelect(action) }] : [];
    }
    // Shortcuts to skills that were deleted since are skipped.
    const skill = skills.find((item) => item.id === shortcut.id);
    return skill && onSelectSkill ? [{ key: `${index}:${shortcutKey(shortcut)}`, label: skill.name, title: undefined, run: () => onSelectSkill(skill) }] : [];
  });
}

export function QuickActions({ onSelect, onSelectSkill, shortcuts = DEFAULT_NEW_CHAT_SHORTCUTS, skills = [], disabled = false }: QuickActionsProps) {
  const { messages } = useI18n();
  const buttons = resolveShortcutButtons(shortcuts, messages.quickActions, skills, onSelect, onSelectSkill);
  if (!buttons.length) return null;
  return (
    <div className="quick-actions" aria-label={messages.quickQuestions}>
      {buttons.map((button) => (
        <button key={button.key} type="button" className="quick-action" aria-label={button.label} title={button.title} disabled={disabled} onClick={button.run}>
          {button.label}
        </button>
      ))}
    </div>
  );
}

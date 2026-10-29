import { useState } from 'react';
import { useSkills } from '../../entrypoints/sidepanel/hooks/useSkills';
import { useI18n } from '../../shared/i18n/I18nProvider';
import {
  DEFAULT_NEW_CHAT_SHORTCUTS,
  MAX_NEW_CHAT_SHORTCUTS,
  shortcutKey,
  type NewChatShortcut,
} from '../../shared/new-chat-shortcuts/preference';
import { useNewChatShortcuts } from '../../shared/new-chat-shortcuts/useNewChatShortcuts';
import type { Skill } from '../../shared/types/skill';
import { Select, type SelectOption } from '../ui/Select';

function parseShortcut(value: string): NewChatShortcut | undefined {
  const [type, ...rest] = value.split(':');
  const id = rest.join(':');
  if (type === 'action' || type === 'skill') return { type, id } as NewChatShortcut;
  return undefined;
}

/** 通用 → 新会话快捷方式: pick the buttons shown at the bottom left of a new conversation. */
export function NewChatShortcutSettings({ skills: initialSkills, shortcuts: initialShortcuts }: { skills?: Skill[]; shortcuts?: NewChatShortcut[] }) {
  const { messages } = useI18n();
  const { skills } = useSkills(initialSkills);
  const { shortcuts, loading, save } = useNewChatShortcuts(initialShortcuts);
  const [error, setError] = useState(false);
  const skillIds = new Set(skills.map((skill) => skill.id));
  // A shortcut to a deleted skill shows as empty instead of a dangling choice.
  const visible = shortcuts.filter((shortcut) => shortcut.type === 'action' || skillIds.has(shortcut.id));
  const slots = Array.from({ length: MAX_NEW_CHAT_SHORTCUTS }, (_, index) => visible[index]);

  async function persist(next: NewChatShortcut[]) {
    setError(false);
    try {
      await save(next);
    } catch {
      setError(true);
    }
  }

  const options: SelectOption<string>[] = [
    { value: '', label: messages.newChatShortcutNone },
    ...messages.quickActions.map((action) => ({ value: `action:${action.id}`, label: action.label, group: messages.newChatShortcutQuickActions })),
    ...skills.map((skill) => ({ value: `skill:${skill.id}`, label: skill.name, group: messages.yourSkills })),
  ];

  function changeSlot(index: number, value: string) {
    const chosen = parseShortcut(value);
    const next = slots.map((slot, position) => (position === index ? chosen : slot));
    // The same action or skill may fill several slots; only empty slots are dropped.
    void persist(next.filter((slot): slot is NewChatShortcut => Boolean(slot)));
  }

  return (
    <section className="new-chat-shortcut-settings" aria-labelledby="new-chat-shortcut-settings-title">
      <div className="new-chat-shortcut-settings__copy">
        <h3 id="new-chat-shortcut-settings-title">{messages.newChatShortcuts}</h3>
        <p>{messages.newChatShortcutsDescription}</p>
      </div>
      <ol className="new-chat-shortcut-settings__slots">
        {slots.map((slot, index) => (
          <li key={index}>
            <Select
              ariaLabel={messages.newChatShortcutSlot(index + 1)}
              disabled={loading}
              value={slot ? shortcutKey(slot) : ''}
              options={options}
              onChange={(value) => changeSlot(index, value)}
            />
          </li>
        ))}
      </ol>
      <button className="text-button new-chat-shortcut-settings__reset" type="button" disabled={loading} onClick={() => void persist(DEFAULT_NEW_CHAT_SHORTCUTS)}>
        {messages.newChatShortcutsReset}
      </button>
      {error && <p className="new-chat-shortcut-settings__error" role="alert">{messages.newChatShortcutsSaveFailed}</p>}
    </section>
  );
}

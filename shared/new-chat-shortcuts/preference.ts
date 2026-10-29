import { STORAGE_KEYS } from '../constants/storage-keys';

export const QUICK_ACTION_IDS = ['summarize', 'explain', 'translate', 'tech-stack'] as const;
export type QuickActionId = (typeof QUICK_ACTION_IDS)[number];

/** One suggestion button on the new-conversation page: a built-in quick action or a saved “/” skill. */
export type NewChatShortcut =
  | { type: 'action'; id: QuickActionId }
  | { type: 'skill'; id: string };

export const MAX_NEW_CHAT_SHORTCUTS = 4;

export const DEFAULT_NEW_CHAT_SHORTCUTS: NewChatShortcut[] = QUICK_ACTION_IDS.map((id) => ({ type: 'action', id }));

function isShortcut(value: unknown): value is NewChatShortcut {
  const candidate = value as Partial<NewChatShortcut> | null;
  if (candidate?.type === 'action') return QUICK_ACTION_IDS.includes(candidate.id as QuickActionId);
  return candidate?.type === 'skill' && typeof candidate.id === 'string' && candidate.id.length > 0;
}

export function shortcutKey(shortcut: NewChatShortcut): string {
  return `${shortcut.type}:${shortcut.id}`;
}

/** Keeps valid entries (repeats allowed); a missing or damaged value falls back to the four quick actions. */
export function resolveNewChatShortcuts(value: unknown): NewChatShortcut[] {
  if (!Array.isArray(value)) return DEFAULT_NEW_CHAT_SHORTCUTS;
  return value.filter(isShortcut).slice(0, MAX_NEW_CHAT_SHORTCUTS);
}

export async function loadNewChatShortcuts(): Promise<NewChatShortcut[]> {
  if (typeof browser === 'undefined' || !browser.storage?.local?.get) return DEFAULT_NEW_CHAT_SHORTCUTS;
  const stored = await browser.storage.local.get(STORAGE_KEYS.newChatShortcuts);
  return resolveNewChatShortcuts(stored[STORAGE_KEYS.newChatShortcuts]);
}

export async function saveNewChatShortcuts(shortcuts: NewChatShortcut[]): Promise<void> {
  if (typeof browser === 'undefined' || !browser.storage?.local?.set) return;
  await browser.storage.local.set({ [STORAGE_KEYS.newChatShortcuts]: shortcuts });
}

/** The saved shortcuts, kept in sync with changes made on the settings page. */
export function subscribeNewChatShortcuts(listener: (shortcuts: NewChatShortcut[]) => void): () => void {
  const storageEvents = typeof browser === 'undefined' ? undefined : browser.storage?.onChanged;
  if (!storageEvents) return () => undefined;
  const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local' || !(STORAGE_KEYS.newChatShortcuts in changes)) return;
    listener(resolveNewChatShortcuts(changes[STORAGE_KEYS.newChatShortcuts]?.newValue));
  };
  storageEvents.addListener(onChanged);
  return () => storageEvents.removeListener(onChanged);
}

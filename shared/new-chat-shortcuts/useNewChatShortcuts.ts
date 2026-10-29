import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_NEW_CHAT_SHORTCUTS,
  loadNewChatShortcuts,
  saveNewChatShortcuts,
  subscribeNewChatShortcuts,
  type NewChatShortcut,
} from './preference';

/** New-conversation suggestions from chrome.storage.local, synced across the panel and settings page. */
export function useNewChatShortcuts(initialShortcuts?: NewChatShortcut[]) {
  const [shortcuts, setShortcuts] = useState<NewChatShortcut[]>(initialShortcuts ?? DEFAULT_NEW_CHAT_SHORTCUTS);
  const [loading, setLoading] = useState(!initialShortcuts);
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (initialShortcuts) return undefined;
    let active = true;
    void loadNewChatShortcuts()
      .then((loaded) => { if (active) setShortcuts(loaded); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    const unsubscribe = subscribeNewChatShortcuts(setShortcuts);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [initialShortcuts]);

  const save = useCallback(async (next: NewChatShortcut[]) => {
    const previous = shortcutsRef.current;
    shortcutsRef.current = next;
    setShortcuts(next);
    try {
      await saveNewChatShortcuts(next);
    } catch (error) {
      shortcutsRef.current = previous;
      setShortcuts(previous);
      throw error;
    }
  }, []);

  return { shortcuts, loading, save };
}

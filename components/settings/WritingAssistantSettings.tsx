import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { STORAGE_KEYS } from '../../shared/constants/storage-keys';
import { useI18n } from '../../shared/i18n/I18nProvider';
import {
  DEFAULT_WRITING_ASSISTANT_ENABLED,
  loadWritingAssistantEnabled,
  resolveWritingAssistantEnabled,
  saveWritingAssistantEnabled,
} from '../../shared/writing-assistant/preference';

export function WritingAssistantSettings() {
  const { messages } = useI18n();
  const [enabled, setEnabled] = useState(DEFAULT_WRITING_ASSISTANT_ENABLED);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const changedLocally = useRef(false);

  useEffect(() => {
    let active = true;
    void loadWritingAssistantEnabled()
      .then((storedEnabled) => {
        if (active && !changedLocally.current) setEnabled(storedEnabled);
      })
      .catch(() => {
        // Keep the default enabled state if local storage is temporarily unavailable.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (typeof browser === 'undefined' || !browser.storage?.onChanged) return;
    const onStorageChanged = (
      changes: Record<string, { newValue?: unknown }>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      const change = changes[STORAGE_KEYS.writingAssistantEnabled];
      if (!change) return;
      setEnabled(resolveWritingAssistantEnabled(change.newValue));
    };
    const storageChanges = browser.storage.onChanged;
    storageChanges.addListener(onStorageChanged);
    return () => storageChanges.removeListener(onStorageChanged);
  }, []);

  async function changeEnabled(event: ChangeEvent<HTMLInputElement>) {
    const nextEnabled = event.target.checked;
    changedLocally.current = true;
    setEnabled(nextEnabled);
    setSaving(true);
    setError(false);
    try {
      await saveWritingAssistantEnabled(nextEnabled);
    } catch {
      const storedEnabled = await loadWritingAssistantEnabled().catch(
        () => DEFAULT_WRITING_ASSISTANT_ENABLED,
      );
      setEnabled(storedEnabled);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="writing-assistant-settings" aria-labelledby="writing-assistant-settings-title">
      <div className="writing-assistant-settings__copy">
        <h3 id="writing-assistant-settings-title">{messages.writingAssistantTitle}</h3>
        <p>{messages.writingAssistantAutoShowDescription}</p>
      </div>
      <label className="settings-switch">
        <span className="sr-only">{messages.writingAssistantAutoShow}</span>
        <input
          checked={enabled}
          disabled={loading || saving}
          onChange={(event) => void changeEnabled(event)}
          role="switch"
          type="checkbox"
        />
        <span className="settings-switch__track" aria-hidden="true">
          <span className="settings-switch__thumb" />
        </span>
      </label>
      {error && (
        <p className="writing-assistant-settings__error" role="alert">
          {messages.writingAssistantSettingError}
        </p>
      )}
    </section>
  );
}

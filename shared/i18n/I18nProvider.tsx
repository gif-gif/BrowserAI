import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { STORAGE_KEYS } from '../constants/storage-keys';
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  isLanguagePreference,
  loadLanguagePreference,
  saveLanguagePreference,
  type LanguagePreference,
} from './language-preference';
import { detectLocale, getMessages } from './locale';
import type { AppLocale, AppMessages } from './messages';

interface I18nValue {
  locale: AppLocale;
  preference: LanguagePreference;
  messages: AppMessages;
  setPreference(preference: LanguagePreference): Promise<void>;
}

const I18nContext = createContext<I18nValue | undefined>(undefined);

export function I18nProvider({
  children,
  locale: requestedLocale,
}: {
  children: ReactNode;
  locale?: AppLocale;
}) {
  const [preference, setPreferenceState] = useState<LanguagePreference>(
    requestedLocale ?? DEFAULT_LANGUAGE_PREFERENCE,
  );
  const changedLocally = useRef(false);
  const locale = requestedLocale ?? (preference === 'auto' ? detectLocale() : preference);

  useEffect(() => {
    if (requestedLocale) return;
    let active = true;

    void loadLanguagePreference().then((storedPreference) => {
      if (active && !changedLocally.current) setPreferenceState(storedPreference);
    }).catch(() => {
      // Keep following Chrome when local storage is temporarily unavailable.
    });

    return () => { active = false; };
  }, [requestedLocale]);

  useEffect(() => {
    if (requestedLocale || typeof browser === 'undefined' || !browser.storage?.onChanged) return;

    const onStorageChanged = (
      changes: Record<string, { newValue?: unknown }>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      const change = changes[STORAGE_KEYS.languagePreference];
      if (!change) return;
      setPreferenceState(
        isLanguagePreference(change.newValue)
          ? change.newValue
          : DEFAULT_LANGUAGE_PREFERENCE,
      );
    };

    const storageChanges = browser.storage.onChanged;
    storageChanges.addListener(onStorageChanged);
    return () => storageChanges.removeListener(onStorageChanged);
  }, [requestedLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setPreference = useCallback(async (nextPreference: LanguagePreference) => {
    if (requestedLocale) return;
    changedLocally.current = true;
    setPreferenceState(nextPreference);
    try {
      await saveLanguagePreference(nextPreference);
    } catch (error) {
      const storedPreference = await loadLanguagePreference().catch(
        () => DEFAULT_LANGUAGE_PREFERENCE,
      );
      setPreferenceState(storedPreference);
      throw error;
    }
  }, [requestedLocale]);

  const value = useMemo(
    () => ({ locale, preference, messages: getMessages(locale), setPreference }),
    [locale, preference, setPreference],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (context) return context;
  const locale = detectLocale();
  return {
    locale,
    preference: DEFAULT_LANGUAGE_PREFERENCE,
    messages: getMessages(locale),
    setPreference: async () => undefined,
  };
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { STORAGE_KEYS } from '../constants/storage-keys';
import {
  DEFAULT_THEME,
  getTheme,
  getThemeTokens,
  isThemeId,
  loadThemePreference,
  saveThemePreference,
  type ThemeId,
} from './theme';
import {
  DARK_SCHEME_QUERY,
  DEFAULT_APPEARANCE,
  isAppearancePreference,
  loadAppearancePreference,
  prefersDarkScheme,
  resolveAppearance,
  saveAppearancePreference,
  type AppearancePreference,
  type ResolvedAppearance,
} from './appearance';

interface ThemeValue {
  theme: ThemeId;
  setTheme(theme: ThemeId): Promise<void>;
  appearance: AppearancePreference;
  /** The light or dark palette in use after resolving `system` against Chrome's mode. */
  resolvedAppearance: ResolvedAppearance;
  setAppearance(appearance: AppearancePreference): Promise<void>;
}

const ThemeContext = createContext<ThemeValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);
  const [appearance, setAppearanceState] = useState<AppearancePreference>(DEFAULT_APPEARANCE);
  const [prefersDark, setPrefersDark] = useState(() => prefersDarkScheme());
  const changedLocally = useRef(false);
  const appearanceChangedLocally = useRef(false);
  const resolvedAppearance = resolveAppearance(appearance, prefersDark);

  useEffect(() => {
    let active = true;
    void loadThemePreference().then((storedTheme) => {
      if (active && !changedLocally.current) setThemeState(storedTheme);
    }).catch(() => {
      // Keep the default theme when local storage is temporarily unavailable.
    });
    void loadAppearancePreference().then((storedAppearance) => {
      if (active && !appearanceChangedLocally.current) setAppearanceState(storedAppearance);
    }).catch(() => {
      // Keep following Chrome when local storage is temporarily unavailable.
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK_SCHEME_QUERY);
    const onSchemeChanged = () => setPrefersDark(query.matches);
    onSchemeChanged();
    query.addEventListener?.('change', onSchemeChanged);
    return () => query.removeEventListener?.('change', onSchemeChanged);
  }, []);

  useEffect(() => {
    if (typeof browser === 'undefined' || !browser.storage?.onChanged) return;

    const onStorageChanged = (
      changes: Record<string, { newValue?: unknown }>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      const change = changes[STORAGE_KEYS.themePreference];
      if (change) setThemeState(isThemeId(change.newValue) ? change.newValue : DEFAULT_THEME);
      const appearanceChange = changes[STORAGE_KEYS.appearancePreference];
      if (appearanceChange) {
        setAppearanceState(isAppearancePreference(appearanceChange.newValue) ? appearanceChange.newValue : DEFAULT_APPEARANCE);
      }
    };

    const storageChanges = browser.storage.onChanged;
    storageChanges.addListener(onStorageChanged);
    return () => storageChanges.removeListener(onStorageChanged);
  }, []);

  // Layout effect so the first paint already uses the right palette instead of flashing light.
  useLayoutEffect(() => {
    const tokens = getThemeTokens(getTheme(theme), resolvedAppearance);
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.appearance = resolvedAppearance;
    root.style.colorScheme = resolvedAppearance;
    root.style.setProperty('--blue', tokens.color);
    root.style.setProperty('--blue-hover', tokens.hover);
    root.style.setProperty('--blue-soft', tokens.soft);
    root.style.setProperty('--focus-ring', tokens.focus);
  }, [theme, resolvedAppearance]);

  const setTheme = useCallback(async (nextTheme: ThemeId) => {
    changedLocally.current = true;
    setThemeState(nextTheme);
    try {
      await saveThemePreference(nextTheme);
    } catch (error) {
      const storedTheme = await loadThemePreference().catch(() => DEFAULT_THEME);
      setThemeState(storedTheme);
      throw error;
    }
  }, []);

  const setAppearance = useCallback(async (nextAppearance: AppearancePreference) => {
    appearanceChangedLocally.current = true;
    setAppearanceState(nextAppearance);
    try {
      await saveAppearancePreference(nextAppearance);
    } catch (error) {
      const storedAppearance = await loadAppearancePreference().catch(() => DEFAULT_APPEARANCE);
      setAppearanceState(storedAppearance);
      throw error;
    }
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, appearance, resolvedAppearance, setAppearance }),
    [theme, setTheme, appearance, resolvedAppearance, setAppearance],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext) ?? {
    theme: DEFAULT_THEME,
    setTheme: async () => undefined,
    appearance: DEFAULT_APPEARANCE,
    resolvedAppearance: 'light',
    setAppearance: async () => undefined,
  };
}

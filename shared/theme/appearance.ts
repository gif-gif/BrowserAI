import { STORAGE_KEYS } from '../constants/storage-keys';

/** Light or dark surfaces. `system` follows Chrome's mode, which Chrome exposes to extension pages as `prefers-color-scheme`. */
export const APPEARANCE_PREFERENCES = ['system', 'light', 'dark'] as const;

export type AppearancePreference = typeof APPEARANCE_PREFERENCES[number];
export type ResolvedAppearance = Exclude<AppearancePreference, 'system'>;

export const DEFAULT_APPEARANCE: AppearancePreference = 'system';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return APPEARANCE_PREFERENCES.includes(value as AppearancePreference);
}

export function resolveAppearance(preference: AppearancePreference, prefersDark: boolean): ResolvedAppearance {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

export function prefersDarkScheme(view: Pick<Window, 'matchMedia'> | undefined = globalThis.window): boolean {
  return typeof view?.matchMedia === 'function' && view.matchMedia(DARK_SCHEME_QUERY).matches;
}

export async function loadAppearancePreference(): Promise<AppearancePreference> {
  if (typeof browser === 'undefined' || !browser.storage?.local?.get) return DEFAULT_APPEARANCE;
  const stored = await browser.storage.local.get(STORAGE_KEYS.appearancePreference);
  const value = stored[STORAGE_KEYS.appearancePreference];
  return isAppearancePreference(value) ? value : DEFAULT_APPEARANCE;
}

export async function saveAppearancePreference(preference: AppearancePreference): Promise<void> {
  if (typeof browser === 'undefined' || !browser.storage?.local?.set) return;
  await browser.storage.local.set({ [STORAGE_KEYS.appearancePreference]: preference });
}

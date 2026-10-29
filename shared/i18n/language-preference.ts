import { STORAGE_KEYS } from '../constants/storage-keys';
import { resolveLocale } from './locale';
import type { AppLocale } from './messages';

export type LanguagePreference = 'auto' | AppLocale;

export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = 'auto';

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || value === 'zh-CN' || value === 'zh-TW' || value === 'en';
}

export function resolveLanguagePreference(
  preference: LanguagePreference,
  browserLanguage?: string | null,
): AppLocale {
  return preference === 'auto' ? resolveLocale(browserLanguage) : preference;
}

export async function loadLanguagePreference(): Promise<LanguagePreference> {
  if (typeof browser === 'undefined' || !browser.storage?.local?.get) {
    return DEFAULT_LANGUAGE_PREFERENCE;
  }

  const stored = await browser.storage.local.get(STORAGE_KEYS.languagePreference);
  const value = stored[STORAGE_KEYS.languagePreference];
  return isLanguagePreference(value) ? value : DEFAULT_LANGUAGE_PREFERENCE;
}

export async function saveLanguagePreference(preference: LanguagePreference): Promise<void> {
  if (typeof browser === 'undefined' || !browser.storage?.local?.set) return;
  await browser.storage.local.set({ [STORAGE_KEYS.languagePreference]: preference });
}

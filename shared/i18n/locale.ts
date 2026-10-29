import type { AppError } from '../errors/app-error';
import { en } from './en';
import type { AppLocale, AppMessages } from './messages';
import { zhCN } from './zh-CN';
import { zhTW } from './zh-TW';

export function resolveLocale(language?: string | null): AppLocale {
  const normalized = language?.trim().toLowerCase();
  if (!normalized?.startsWith('zh')) return 'en';
  if (
    normalized.startsWith('zh-tw')
    || normalized.startsWith('zh-hk')
    || normalized.startsWith('zh-mo')
    || normalized.includes('hant')
  ) return 'zh-TW';
  return 'zh-CN';
}

export function detectLocale(): AppLocale {
  let language: string | undefined;
  try {
    language = typeof browser !== 'undefined' ? browser.i18n?.getUILanguage?.() : undefined;
  } catch {
    language = undefined;
  }
  if (!language && typeof navigator !== 'undefined') language = navigator.language;
  return resolveLocale(language);
}

export function getMessages(locale: AppLocale = detectLocale()): AppMessages {
  if (locale === 'zh-CN') return zhCN;
  if (locale === 'zh-TW') return zhTW;
  return en;
}

export function localizeError(error: Pick<AppError, 'code' | 'message'>, messages = getMessages()): string {
  // Preserve detailed existing Chinese diagnostics while ensuring English Chrome never leaks Chinese backend text.
  if (messages === zhCN && error.message) return error.message;
  return messages.errors[error.code] ?? error.message ?? messages.errors.UNKNOWN;
}

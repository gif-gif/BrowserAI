import type { AppLocale } from '../i18n/messages';

export const WRITING_TONES = ['polish', 'professional', 'friendly', 'concise'] as const;
export type WritingTone = typeof WRITING_TONES[number];

export interface WritingAssistInput {
  requestId: string;
  text: string;
  instruction?: string;
  model?: string;
  tone: WritingTone;
  locale: AppLocale;
}

export interface WritingAssistResult {
  text: string;
}

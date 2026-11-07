import type { AppLocale } from '../i18n/messages';
import type { SkillInvocation } from './skill';

export const WRITING_TONES = ['polish', 'professional', 'friendly', 'concise'] as const;
export type WritingTone = typeof WRITING_TONES[number];

export interface WritingAssistInput {
  requestId: string;
  text: string;
  instruction?: string;
  model?: string;
  tone: WritingTone;
  /** When set, the skill's instructions replace the tone's rewrite style. */
  skill?: SkillInvocation;
  locale: AppLocale;
}

export interface WritingAssistResult {
  text: string;
}

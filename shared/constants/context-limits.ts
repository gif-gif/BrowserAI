import type { ContextLimits } from '../types/context';

export const MIN_DOCUMENT_CONTEXT_CHARACTERS = 5_000;
export const MAX_DOCUMENT_CONTEXT_CHARACTERS = 200_000;
export const DOCUMENT_CONTEXT_CHARACTER_OPTIONS = [5_000, 10_000, 20_000, 40_000, 80_000, 120_000, 200_000] as const;

export const DEFAULT_CONTEXT_LIMITS: ContextLimits = {
  titleCharacters: 500,
  selectionCharacters: 12_000,
  documentCharacters: 40_000,
};

/** Maximum number of browser tabs that can be shared with one message. */
export const MAX_SHARED_TABS = 5;
/** Share of the prompt budget reserved for page text when several tabs are shared. */
export const MULTI_TAB_PAGE_BUDGET_SHARE = 0.6;
export const MIN_MULTI_TAB_PAGE_CHARACTERS = 5_000;

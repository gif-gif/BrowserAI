import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTEXT_LIMITS,
  MAX_DOCUMENT_CONTEXT_CHARACTERS,
  MIN_DOCUMENT_CONTEXT_CHARACTERS,
} from '../../../shared/constants/context-limits';
import { STORAGE_KEYS } from '../../../shared/constants/storage-keys';

describe('shared constants', () => {
  it('uses approved context limits', () => {
    expect(DEFAULT_CONTEXT_LIMITS).toEqual({ titleCharacters: 500, selectionCharacters: 12_000, documentCharacters: 40_000 });
    expect(MIN_DOCUMENT_CONTEXT_CHARACTERS).toBe(5_000);
    expect(MAX_DOCUMENT_CONTEXT_CHARACTERS).toBe(200_000);
  });
  it('namespaces storage keys', () => {
    expect(Object.values(STORAGE_KEYS).every((key) => key.startsWith('chromeAi:v1:'))).toBe(true);
  });
});

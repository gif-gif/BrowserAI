import { describe, expect, it } from 'vitest';
import { sanitizeText } from '../../../core/page-context/sanitize-text';

describe('sanitizeText', () => {
  it('normalizes horizontal whitespace and repeated blank lines', () => {
    expect(sanitizeText('  Alpha\t  beta  \r\n\r\n\r\n  Gamma \u00a0 delta  ')).toBe(
      'Alpha beta\n\nGamma delta',
    );
  });

  it('removes zero-width and control characters without joining words', () => {
    expect(sanitizeText('one\u200Btwo\u0000 three')).toBe('onetwo three');
  });
});

import { describe, expect, it } from 'vitest';
import { truncatePageContext } from '../../../core/page-context/truncate-context';

describe('truncatePageContext', () => {
  it('applies title, selection, and document limits independently', () => {
    const result = truncatePageContext(
      { title: '标题标题标题', selection: 'selected-text', document: 'document-body' },
      { titleCharacters: 4, selectionCharacters: 8, documentCharacters: 9 },
    );

    expect(result.title.text).toBe('标题标题');
    expect(result.selection?.text).toBe('selected');
    expect(result.document?.text).toBe('document-');
  });

  it('reports original and submitted character counts for every part and in aggregate', () => {
    const result = truncatePageContext(
      { title: '12345', selection: '123456', document: '1234567' },
      { titleCharacters: 3, selectionCharacters: 4, documentCharacters: 5 },
    );

    expect(result.title.metadata).toEqual({ originalCharacterCount: 5, submittedCharacterCount: 3, truncated: true });
    expect(result.selection?.metadata).toEqual({ originalCharacterCount: 6, submittedCharacterCount: 4, truncated: true });
    expect(result.document?.metadata).toEqual({ originalCharacterCount: 7, submittedCharacterCount: 5, truncated: true });
    expect(result.metadata).toEqual({ originalCharacterCount: 18, submittedCharacterCount: 12, truncated: true });
  });
});

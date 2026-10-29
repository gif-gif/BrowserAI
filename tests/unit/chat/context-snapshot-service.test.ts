import { describe, expect, it } from 'vitest';
import { ContextSnapshotService } from '../../../core/chat/context-snapshot-service';
import type { ExtractedPageContext } from '../../../shared/types/context';

const snapshot = (id = 'snapshot-1', navigationKey = 'nav-1'): ExtractedPageContext => ({
  snapshotId: id, tabId: 3, title: 'Page', url: 'https://example.com',
  document: { text: 'content', extractionMethod: 'innerText' },
  metadata: { extractedAt: 1, originalCharacterCount: 7, submittedCharacterCount: 7, truncated: false, navigationKey },
});

describe('ContextSnapshotService', () => {
  it('keeps raw snapshots in memory and resolves the current snapshot', () => {
    const service = new ContextSnapshotService();
    service.store(snapshot());
    expect(service.require(3, 'snapshot-1', 'nav-1').document?.text).toBe('content');
  });

  it('invalidates snapshots on navigation and rejects stale ids explicitly', () => {
    const service = new ContextSnapshotService();
    service.store(snapshot());
    service.invalidate(3, 'nav-2');
    expect(() => service.require(3, 'snapshot-1', 'nav-2')).toThrowError(expect.objectContaining({ code: 'CONTEXT_STALE' }));
  });

  it('attaches an explicit selection to the next snapshot but clears it on navigation', () => {
    const service = new ContextSnapshotService();
    service.attachSelection(3, '  selected text  ');
    service.invalidate(3, 'nav-2');
    service.store(snapshot('snapshot-2', 'nav-2'));
    expect(service.current(3)?.selection).toBeUndefined();

    service.attachSelection(3, 'selected text');
    expect(service.current(3)?.selection).toEqual({ text: 'selected text' });
  });

  it('mirrors the live page selection and clears it when the selection is removed', () => {
    const service = new ContextSnapshotService();
    service.store(snapshot());
    service.syncSelection(3, ' live text ');
    expect(service.current(3)?.selection).toEqual({ text: 'live text' });
    service.syncSelection(3, '');
    expect(service.current(3)?.selection).toBeUndefined();
    expect(service.require(3, 'snapshot-1', 'nav-1').snapshotId).toBe('snapshot-1');

    const pending = new ContextSnapshotService();
    pending.syncSelection(3, 'early');
    pending.syncSelection(3, '');
    pending.store(snapshot());
    expect(pending.current(3)?.selection).toBeUndefined();
  });
});

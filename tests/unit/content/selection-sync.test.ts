import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionSync } from '../../../core/selection/selection-sync';

function selectionOf(text: string, node: Node = document.body) {
  return { toString: () => text, anchorNode: node, focusNode: node } as unknown as Selection;
}

describe('SelectionSync', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('coalesces selection changes and only reports new or cleared text', () => {
    let current = selectionOf('');
    const sendEvent = vi.fn();
    const sync = new SelectionSync({
      document, window, sendEvent, getSelection: () => current, createRequestId: () => 'id', delayMs: 100,
    });
    sync.start();

    current = selectionOf('first');
    document.dispatchEvent(new Event('selectionchange'));
    current = selectionOf('  first   words ');
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(100);
    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(sendEvent).toHaveBeenLastCalledWith({ version: 1, requestId: 'id', type: 'SELECTION_CHANGED', text: 'first words' });

    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(100);
    expect(sendEvent).toHaveBeenCalledTimes(1);

    current = selectionOf('');
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(100);
    expect(sendEvent).toHaveBeenLastCalledWith(expect.objectContaining({ text: '' }));

    sync.stop();
    current = selectionOf('after stop');
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(100);
    expect(sendEvent).toHaveBeenCalledTimes(2);
  });

  it('ignores password fields and extension-owned UI, and caps long selections', () => {
    document.body.innerHTML = '<input type="password" id="pw"><div data-chrome-ai-owned="true"><span id="owned">x</span></div>';
    let current = selectionOf('secret', document.getElementById('pw')!);
    const sendEvent = vi.fn();
    const sync = new SelectionSync({ document, window, sendEvent, getSelection: () => current, delayMs: 0, maxCharacters: 5 });
    sync.start();

    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(0);
    current = selectionOf('assistant', document.getElementById('owned')!.firstChild!);
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(0);
    expect(sendEvent).not.toHaveBeenCalled();

    current = selectionOf('abcdefghij');
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(0);
    expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({ text: 'abcde' }));
    sync.stop();
  });
});

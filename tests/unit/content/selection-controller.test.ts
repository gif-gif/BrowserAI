import { fireEvent } from '@testing-library/dom';
import { describe, expect, it, vi } from 'vitest';
import { SelectionController } from '../../../core/selection/selection-controller';

function rangeSelection(text = 'selected text') {
  return {
    toString: () => text,
    rangeCount: text ? 1 : 0,
    getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 40, right: 140, top: 50, bottom: 70, width: 100, height: 20 }) }),
    anchorNode: document.body,
  } as unknown as Selection;
}

describe('SelectionController', () => {
  it('shows after pointer release, hides on Escape and sends the action on click', () => {
    const show = vi.fn();
    const hide = vi.fn();
    let click: (() => void) | undefined;
    const send = vi.fn();
    const controller = new SelectionController({
      document,
      window,
      getSelection: () => rangeSelection(),
      button: { show, hide, destroy: vi.fn(), setClickHandler: (handler) => { click = handler; } },
      sendEvent: send,
      createRequestId: () => 'selection-1',
    });
    controller.start();

    fireEvent.pointerUp(document.body);
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ text: 'selected text' }));
    click?.();
    expect(send).toHaveBeenCalledWith({ version: 1, requestId: 'selection-1', type: 'SELECTION_ACTION_CLICKED', text: 'selected text' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(hide).toHaveBeenCalled();
    controller.stop();
  });

  it('does not show for password fields or extension-owned nodes', () => {
    const show = vi.fn();
    const password = document.createElement('input');
    password.type = 'password';
    document.body.append(password);
    const owned = document.createElement('span');
    owned.setAttribute('data-chrome-ai-owned', 'true');
    document.body.append(owned);
    const controller = new SelectionController({
      document, window, getSelection: () => rangeSelection(),
      button: { show, hide: vi.fn(), destroy: vi.fn(), setClickHandler: vi.fn() },
      sendEvent: vi.fn(),
    });
    controller.start();
    fireEvent.pointerUp(password);
    fireEvent.pointerUp(owned);
    expect(show).not.toHaveBeenCalled();
    controller.stop();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { CONTEXT_MENU_IDS, registerContextMenus } from '../../core/background/register-context-menus';

function clickEvent() {
  const listeners: Array<(info: { menuItemId: string | number; selectionText?: string }, tab?: { id?: number; url?: string }) => void> = [];
  return {
    addListener(listener: typeof listeners[number]) { listeners.push(listener); },
    removeListener(listener: typeof listeners[number]) {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
    listeners,
  };
}

describe('context-menu actions', () => {
  it('installs menus idempotently and attaches selected text before opening the panel', async () => {
    const onClicked = clickEvent();
    const menus = { removeAll: vi.fn(async () => undefined), create: vi.fn(), onClicked };
    const openPanel = vi.fn(async () => undefined);
    const resolveTab = vi.fn(async () => ({ conversation: { id: 'c1' } }));
    const attachSelection = vi.fn();

    const registration = registerContextMenus(menus, { openPanel, resolveTab, attachSelection });
    await registration.ready;

    expect(menus.removeAll).toHaveBeenCalledOnce();
    expect(menus.create).toHaveBeenCalledTimes(4);
    expect(menus.create).toHaveBeenCalledWith(expect.objectContaining({ id: CONTEXT_MENU_IDS.ask, contexts: ['selection'] }));

    await onClicked.listeners[0]!({ menuItemId: CONTEXT_MENU_IDS.summarize, selectionText: '  重点文字  ' }, { id: 9, url: 'https://example.test' });
    expect(resolveTab).toHaveBeenCalledWith({ id: 9, url: 'https://example.test' });
    expect(attachSelection).toHaveBeenCalledWith(9, '重点文字');
    expect(openPanel).toHaveBeenCalledWith({ id: 9, url: 'https://example.test' });

    registration.dispose();
    expect(onClicked.listeners).toHaveLength(0);
  });

  it('ignores malformed clicks that have no usable tab or selection', async () => {
    const onClicked = clickEvent();
    const dependencies = { openPanel: vi.fn(), resolveTab: vi.fn(), attachSelection: vi.fn() };
    const registration = registerContextMenus({ removeAll: vi.fn(), create: vi.fn(), onClicked }, dependencies);
    await registration.ready;
    await onClicked.listeners[0]!({ menuItemId: CONTEXT_MENU_IDS.ask, selectionText: ' ' }, { id: 1, url: 'https://example.test' });
    await onClicked.listeners[0]!({ menuItemId: CONTEXT_MENU_IDS.ask, selectionText: 'text' }, {});
    expect(dependencies.openPanel).not.toHaveBeenCalled();
  });
});

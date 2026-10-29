import { describe, expect, it, vi } from 'vitest';
import { InPageFloatingChat } from '../../../core/floating-chat/in-page-floating-chat';
import { supportsFloatingChat } from '../../../shared/types/floating-chat';

const messages = {
  floatingChatTitle: 'Browser AI',
  floatingChatClose: '关闭浮动聊天',
  floatingChatMinimize: '最小化',
  floatingChatRestore: '还原',
};

describe('InPageFloatingChat', () => {
  it('mounts once, and removes itself and reports when closed from its title bar', () => {
    const onClose = vi.fn();
    const chat = new InPageFloatingChat({ document, window, messages, onClose, onLayoutChange: vi.fn() });
    chat.show('chrome-extension://id/floating.html', { x: -1, y: -1, width: 420, height: 640 });
    chat.show('chrome-extension://id/floating.html', { x: -1, y: -1, width: 420, height: 640 });
    expect(document.querySelectorAll('chrome-ai-floating-chat')).toHaveLength(1);
    expect(chat.visible).toBe(true);

    chat.hide();
    expect(chat.visible).toBe(false);
    expect(document.querySelector('chrome-ai-floating-chat')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('supportsFloatingChat', () => {
  it('allows ordinary web pages only', () => {
    expect(supportsFloatingChat('https://example.com/a')).toBe(true);
    expect(supportsFloatingChat('chrome://settings')).toBe(false);
    expect(supportsFloatingChat('https://chromewebstore.google.com/detail/x')).toBe(false);
    expect(supportsFloatingChat('not a url')).toBe(false);
  });
});

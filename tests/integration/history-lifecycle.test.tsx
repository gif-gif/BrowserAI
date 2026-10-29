import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App, { type SidePanelDependencies } from '../../entrypoints/sidepanel/App';
import type { ChatStreamPort } from '../../entrypoints/sidepanel/hooks/useChatStream';
import type { Conversation } from '../../shared/types/chat';
import type { ActiveTabState } from '../../shared/types/tab-state';
import { zhCN } from '../../shared/i18n/zh-CN';

const isGreeting = (name: string) => zhCN.greetings.includes(name);

function event<T>() {
  const listeners = new Set<(value: T) => void>();
  return { addListener(listener: (value: T) => void) { listeners.add(listener); }, removeListener(listener: (value: T) => void) { listeners.delete(listener); } };
}

function port(): ChatStreamPort {
  return { postMessage: vi.fn(), onMessage: event<unknown>(), onDisconnect: event<void>(), disconnect: vi.fn() };
}

function conversation(id: string, updatedAt: number, pinned = false): Conversation {
  return { id, title: `对话 ${id}`, messages: [], providerId: 'p1', model: 'm1', promptVersion: 'v1', pinned, createdAt: 1, updatedAt };
}

function active(current: Conversation): ActiveTabState {
  return { tabId: 7, url: 'https://example.com', navigationKey: 'nav-1', conversation: current, context: { status: 'unavailable', reason: 'PAGE_UNSUPPORTED' } };
}

describe('history lifecycle', () => {
  it('opens history, switches conversations, and replaces a deleted active conversation safely', async () => {
    const user = userEvent.setup();
    const first = conversation('current', 1);
    const selected = conversation('selected', 2);
    const replacement = conversation('replacement', 3);
    let activeState = active(first);
    const send = vi.fn(async (command: { type: string; conversationId?: string }) => {
      if (command.type === 'GET_ACTIVE_TAB_STATE') return activeState;
      if (command.type === 'GET_PROVIDER_SETTINGS') return { providers: [{ config: { id: 'p1', model: 'm1' }, hasApiKey: true }] };
      if (command.type === 'LIST_CONVERSATIONS') return { conversations: [first, selected], retentionDays: 30 };
      if (command.type === 'OPEN_CONVERSATION') { activeState = active(selected); return activeState; }
      if (command.type === 'DELETE_CONVERSATION') { activeState = active(replacement); return { deleted: true, activeState }; }
      return undefined;
    });
    const dependencies = { runtime: { send }, createChatPort: port, createRequestId: () => 'request-1', openOptionsPage: vi.fn() } as unknown as SidePanelDependencies;
    render(<App dependencies={dependencies} />);

    await user.click(await screen.findByRole('button', { name: '历史记录' }));
    expect(await screen.findByRole('dialog', { name: '对话历史' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '打开对话 selected' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'OPEN_CONVERSATION', conversationId: 'selected', tabId: 7 })));

    await user.click(screen.getByRole('button', { name: '历史记录' }));
    await user.click(await screen.findByRole('button', { name: '删除对话 selected' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'DELETE_CONVERSATION', conversationId: 'selected', tabId: 7 })));
    expect(screen.queryByRole('button', { name: '删除对话 selected' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: isGreeting })).toBeInTheDocument();
  });
  it('clears all unpinned history and replaces the active conversation', async () => {
    const user = userEvent.setup();
    const current = conversation('current', 3);
    const ordinary = conversation('ordinary', 2);
    const pinned = conversation('pinned', 1, true);
    const replacement = conversation('replacement', 4);
    let activeState = active(current);
    let history = [current, ordinary, pinned];
    const send = vi.fn(async (command: { type: string; tabId?: number }) => {
      if (command.type === 'GET_ACTIVE_TAB_STATE') return activeState;
      if (command.type === 'GET_PROVIDER_SETTINGS') return { providers: [{ config: { id: 'p1', model: 'm1' }, hasApiKey: true }] };
      if (command.type === 'LIST_CONVERSATIONS') return { conversations: history, retentionDays: 30 };
      if (command.type === 'CLEAR_CONVERSATIONS') {
        history = [pinned];
        activeState = active(replacement);
        return { deletedIds: ['current', 'ordinary'], activeState };
      }
      return undefined;
    });
    const dependencies = { runtime: { send }, createChatPort: port, createRequestId: () => 'request-1', openOptionsPage: vi.fn() } as unknown as SidePanelDependencies;
    render(<App dependencies={dependencies} />);

    await user.click(await screen.findByRole('button', { name: '历史记录' }));
    await user.click(await screen.findByRole('button', { name: '清空未固定历史' }));

    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CLEAR_CONVERSATIONS',
      tabId: 7,
    })));
    expect(screen.queryByRole('button', { name: '打开对话 current' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开对话 ordinary' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开对话 pinned' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: isGreeting })).toBeInTheDocument();
  });

});

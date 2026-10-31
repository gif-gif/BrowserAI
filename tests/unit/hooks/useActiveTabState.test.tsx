import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useActiveTabState, type TabActivitySource } from '../../../entrypoints/sidepanel/hooks/useActiveTabState';
import type { ActiveTabState } from '../../../shared/types/tab-state';

function state(tabId: number, conversationId: string): ActiveTabState {
  return {
    tabId,
    url: `https://tab-${tabId}.example`,
    navigationKey: `nav-${tabId}`,
    conversation: {
      id: conversationId,
      title: conversationId,
      messages: [],
      
      model: 'model-1',
      promptVersion: 'v1',
      pinned: false,
      createdAt: 1,
      updatedAt: 1,
    },
    context: { status: 'unavailable', reason: 'PAGE_UNSUPPORTED' },
  };
}

describe('useActiveTabState', () => {
  it('loads the active-tab conversation and clears transient UI before a tab refresh', async () => {
    let activate: (() => void) | undefined;
    const tabActivity: TabActivitySource = {
      subscribe(listener) { activate = listener; return () => { activate = undefined; }; },
    };
    const send = vi.fn()
      .mockResolvedValueOnce(state(1, 'conversation-one'))
      .mockResolvedValueOnce(state(2, 'conversation-two'));
    const onBeforeLoad = vi.fn();

    const { result } = renderHook(() => useActiveTabState({
      runtime: { send },
      tabActivity,
      onBeforeLoad,
      createRequestId: () => 'state-request',
    }));
    await waitFor(() => expect(result.current.data?.conversation.id).toBe('conversation-one'));

    act(() => activate?.());
    // Activity refreshes revalidate quietly; transient UI resets once the tab changed.
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(result.current.data?.conversation.id).toBe('conversation-two'));
    expect(onBeforeLoad).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'GET_ACTIVE_TAB_STATE' }));
  });

  it('keeps activity refreshes pinned to the original content tab while floating', async () => {
    let activate: (() => void) | undefined;
    const tabActivity: TabActivitySource = {
      subscribe(listener) { activate = listener; return () => { activate = undefined; }; },
    };
    const send = vi.fn()
      .mockResolvedValueOnce(state(7, 'conversation-seven'))
      .mockResolvedValueOnce(state(7, 'conversation-seven-refreshed'));
    const { result } = renderHook(() => useActiveTabState({
      runtime: { send },
      tabActivity,
      pinCurrentTab: true,
      createRequestId: () => 'state-request',
    }));
    await waitFor(() => expect(result.current.data?.tabId).toBe(7));

    act(() => activate?.());
    await waitFor(() => expect(result.current.data?.conversation.id).toBe('conversation-seven-refreshed'));

    expect(send).toHaveBeenLastCalledWith({
      version: 1,
      requestId: 'state-request',
      type: 'OPEN_CONVERSATION',
      tabId: 7,
      conversationId: 'conversation-seven',
    });
  });

  it('can refresh a known content tab without depending on the currently focused window', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce(state(7, 'conversation-seven'))
      .mockResolvedValueOnce(state(7, 'conversation-seven-refreshed'));
    const { result } = renderHook(() => useActiveTabState({
      runtime: { send },
      createRequestId: () => 'state-request',
    }));
    await waitFor(() => expect(result.current.data?.conversation.id).toBe('conversation-seven'));

    await act(async () => { await result.current.refresh(7); });

    expect(send).toHaveBeenLastCalledWith({
      version: 1,
      requestId: 'state-request',
      type: 'OPEN_CONVERSATION',
      tabId: 7,
      conversationId: 'conversation-seven',
    });
    expect(result.current.data?.conversation.id).toBe('conversation-seven-refreshed');
  });

  it('can refresh persisted chat state without clearing the optimistic turn first', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce(state(7, 'conversation-seven'))
      .mockResolvedValueOnce(state(7, 'conversation-seven'));
    const onBeforeLoad = vi.fn();
    const { result } = renderHook(() => useActiveTabState({
      runtime: { send },
      onBeforeLoad,
      createRequestId: () => 'state-request',
    }));
    await waitFor(() => expect(result.current.data?.tabId).toBe(7));
    expect(onBeforeLoad).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh(7, { preserveTransient: true });
    });

    expect(onBeforeLoad).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'OPEN_CONVERSATION',
      tabId: 7,
    }));
  });

  it('uses exact tab lookup only when no conversation is bound to the requested tab', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce(state(7, 'conversation-seven'))
      .mockResolvedValueOnce(state(8, 'conversation-eight'));
    const { result } = renderHook(() => useActiveTabState({
      runtime: { send },
      createRequestId: () => 'state-request',
    }));
    await waitFor(() => expect(result.current.data?.tabId).toBe(7));

    await act(async () => { await result.current.refresh(8); });

    expect(send).toHaveBeenLastCalledWith({
      version: 1,
      requestId: 'state-request',
      type: 'GET_TAB_STATE',
      tabId: 8,
    });
  });

  it('ignores a slower response after a newer refresh has completed', async () => {
    let resolveFirst: ((value: ActiveTabState) => void) | undefined;
    const first = new Promise<ActiveTabState>((resolve) => { resolveFirst = resolve; });
    const send = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(state(2, 'newer'));
    const { result } = renderHook(() => useActiveTabState({ runtime: { send } }));

    act(() => { void result.current.refresh(); });
    await waitFor(() => expect(result.current.data?.conversation.id).toBe('newer'));
    act(() => resolveFirst?.(state(1, 'older')));
    await act(async () => Promise.resolve());
    expect(result.current.data?.conversation.id).toBe('newer');
  });

  it('refocusing the panel on the same conversation does not show loading or reset transient UI', async () => {
    let activate: (() => void) | undefined;
    const tabActivity: TabActivitySource = {
      subscribe(listener) { activate = listener; return () => { activate = undefined; }; },
    };
    const send = vi.fn().mockResolvedValue(state(1, 'conversation-one'));
    const onBeforeLoad = vi.fn();
    const { result } = renderHook(() => useActiveTabState({
      runtime: { send },
      tabActivity,
      onBeforeLoad,
      createRequestId: () => 'state-request',
    }));
    await waitFor(() => expect(result.current.data?.conversation.id).toBe('conversation-one'));
    expect(onBeforeLoad).toHaveBeenCalledTimes(1);

    act(() => activate?.());
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(result.current.loading).toBe(false);
    expect(onBeforeLoad).toHaveBeenCalledTimes(1);
  });
});

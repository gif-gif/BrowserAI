import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChatStream, type ChatStreamPort } from '../../../entrypoints/sidepanel/hooks/useChatStream';

type Listener<T> = (value: T) => void;

function event<T>() {
  const listeners = new Set<Listener<T>>();
  return {
    addListener(listener: Listener<T>) { listeners.add(listener); },
    removeListener(listener: Listener<T>) { listeners.delete(listener); },
    emit(value: T) { for (const listener of listeners) listener(value); },
  };
}

function createPort(): ChatStreamPort & { emit(message: unknown): void; disconnectNow(): void } {
  const messages = event<unknown>();
  const disconnects = event<void>();
  return {
    postMessage: vi.fn(),
    onMessage: messages,
    onDisconnect: disconnects,
    disconnect: vi.fn(),
    emit: messages.emit,
    disconnectNow: () => disconnects.emit(undefined),
  };
}

describe('useChatStream', () => {
  it('binds events to the active request and ignores late events from older requests', () => {
    const port = createPort();
    const { result } = renderHook(() => useChatStream({
      createPort: () => port,
      createRequestId: () => 'request-1',
      onReconcile: vi.fn(),
    }));

    act(() => {
      result.current.start({
        tabId: 7,
        conversationId: 'conversation-1',
        text: '你好',
        contextSelection: { includePage: true, includeSelection: false, snapshotId: 'snapshot-1' },
      });
    });
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_CHAT',
      requestId: 'request-1',
    }));

    act(() => {
      port.emit({ version: 1, type: 'delta', requestId: 'old-request', text: '旧内容' });
      port.emit({ version: 1, type: 'delta', requestId: 'request-1', text: '新内容' });
    });
    expect(result.current.stream.text).toBe('新内容');
  });

  it('stores generated-image events for optimistic rendering', () => {
    const port = createPort();
    const { result } = renderHook(() => useChatStream({
      createPort: () => port,
      createRequestId: () => 'request-image',
      onReconcile: vi.fn(),
    }));

    act(() => result.current.start({
      tabId: 1,
      conversationId: 'c1',
      text: '画一只猫',
      contextSelection: { includePage: false, includeSelection: false },
    }));
    act(() => {
      port.emit({
        version: 1,
        type: 'image',
        requestId: 'request-image',
        index: 0,
        image: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,aGVsbG8=' },
      });
    });

    expect(result.current.stream.images).toEqual([{
      id: 'generated-request-image-0',
      name: 'generated-image-1.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      source: 'generated',
    }]);
  });

  it('sends cancellation once and disables duplicate stop requests', () => {
    const port = createPort();
    const { result } = renderHook(() => useChatStream({
      createPort: () => port,
      createRequestId: () => 'request-stop',
      onReconcile: vi.fn(),
    }));
    act(() => result.current.start({
      tabId: 1,
      conversationId: 'c1',
      text: '停止测试',
      contextSelection: { includePage: false, includeSelection: false },
    }));

    act(() => {
      result.current.stop();
      result.current.stop();
    });
    const cancelCalls = vi.mocked(port.postMessage).mock.calls.filter(([message]) => (
      message as { type?: string }
    ).type === 'CANCEL_CHAT');
    expect(cancelCalls).toHaveLength(1);
    expect(result.current.stream.status).toBe('cancelled');
    expect(result.current.canStop).toBe(false);
  });

  it('reconnects and reconciles from persisted state after a port disconnect', async () => {
    const first = createPort();
    const second = createPort();
    const onReconcile = vi.fn(async () => true);
    const create = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const { result } = renderHook(() => useChatStream({
      createPort: create,
      createRequestId: () => 'request-reconnect',
      onReconcile,
    }));
    act(() => result.current.start({
      tabId: 1,
      conversationId: 'c1',
      text: '重连测试',
      contextSelection: { includePage: false, includeSelection: false },
    }));
    act(() => first.emit({ version: 1, type: 'delta', requestId: 'request-reconnect', text: '临时文本' }));
    expect(result.current.stream.text).toBe('临时文本');

    act(() => first.disconnectNow());
    await waitFor(() => expect(onReconcile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(result.current.stream.status).toBe('idle');
    expect(result.current.stream.text).toBe('');
  });

  it('recovers from a stale port when sending throws and allows the next message', async () => {
    const first = createPort();
    const second = createPort();
    vi.mocked(first.postMessage).mockImplementation(() => { throw new Error('Extension context invalidated'); });
    const create = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const requestIds = ['request-failed', 'request-retry'];
    const onReconcile = vi.fn(async () => false);
    const { result } = renderHook(() => useChatStream({
      createPort: create,
      createRequestId: () => requestIds.shift()!,
      onReconcile,
    }));

    let failedRequest: string | undefined;
    act(() => {
      failedRequest = result.current.start({
        tabId: 1,
        conversationId: 'c1',
        text: '第一次发送',
        contextSelection: { includePage: false, includeSelection: false },
      });
    });
    expect(failedRequest).toBeUndefined();
    expect(result.current.stream.status).toBe('idle');
    expect(create).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(onReconcile).toHaveBeenCalledTimes(1));

    let retryRequest: string | undefined;
    act(() => {
      retryRequest = result.current.start({
        tabId: 1,
        conversationId: 'c1',
        text: '再次发送',
        contextSelection: { includePage: false, includeSelection: false },
      });
    });
    expect(retryRequest).toBe('request-retry');
    expect(second.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_CHAT', requestId: 'request-retry', text: '再次发送',
    }));
  });

  it('rejects an invalid command locally without entering a stuck streaming state', () => {
    const port = createPort();
    const { result } = renderHook(() => useChatStream({
      createPort: () => port,
      createRequestId: () => 'request-invalid',
      onReconcile: vi.fn(),
    }));

    let requestId: string | undefined;
    act(() => {
      requestId = result.current.start({
        tabId: 1,
        conversationId: 'c1',
        text: '   ',
        contextSelection: { includePage: false, includeSelection: false },
      });
    });

    expect(requestId).toBeUndefined();
    expect(port.postMessage).not.toHaveBeenCalled();
    expect(result.current.stream.status).toBe('idle');
  });

  it('stops rendering immediately and ignores buffered events after cancellation', async () => {
    const port = createPort();
    const onReconcile = vi.fn(async () => true);
    const { result } = renderHook(() => useChatStream({
      createPort: () => port,
      createRequestId: () => 'request-immediate-stop',
      onReconcile,
    }));
    act(() => result.current.start({
      tabId: 1,
      conversationId: 'c1',
      text: '生成很长的回答',
      contextSelection: { includePage: false, includeSelection: false },
    }));
    act(() => port.emit({
      version: 1,
      type: 'delta',
      requestId: 'request-immediate-stop',
      text: '停止前的内容',
    }));

    act(() => result.current.stop());
    expect(result.current.stream).toMatchObject({
      status: 'cancelled',
      text: '停止前的内容',
    });

    act(() => {
      port.emit({
        version: 1,
        type: 'delta',
        requestId: 'request-immediate-stop',
        text: '不应继续追加',
      });
      port.emit({
        version: 1,
        type: 'image',
        requestId: 'request-immediate-stop',
        index: 0,
        image: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,aGVsbG8=' },
      });
    });
    expect(result.current.stream.text).toBe('停止前的内容');
    expect(result.current.stream.images).toEqual([]);

    act(() => port.emit({
      version: 1,
      type: 'failed',
      requestId: 'request-immediate-stop',
      error: { code: 'REQUEST_CANCELLED', message: '请求已取消', retryable: false },
    }));
    await waitFor(() => expect(onReconcile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.stream.status).toBe('idle'));
  });

  it('keeps a completed turn visible when persisted-state reconciliation fails', async () => {
    const port = createPort();
    const onReconcile = vi.fn(async () => false);
    const requestIds = ['request-completed', 'request-next'];
    const { result } = renderHook(() => useChatStream({
      createPort: () => port,
      createRequestId: () => requestIds.shift()!,
      onReconcile,
    }));

    act(() => result.current.start({
      tabId: 1,
      conversationId: 'c1',
      text: '保留回答',
      contextSelection: { includePage: false, includeSelection: false },
    }));
    act(() => {
      port.emit({ version: 1, type: 'delta', requestId: 'request-completed', text: '已经生成的内容' });
      port.emit({ version: 1, type: 'completed', requestId: 'request-completed' });
    });

    await waitFor(() => expect(onReconcile).toHaveBeenCalledTimes(1));
    expect(result.current.stream).toMatchObject({
      requestId: 'request-completed',
      status: 'completed',
      text: '已经生成的内容',
    });

    let nextRequest: string | undefined;
    act(() => {
      nextRequest = result.current.start({
        tabId: 1,
        conversationId: 'c1',
        text: '下一条消息',
        contextSelection: { includePage: false, includeSelection: false },
      });
    });
    expect(nextRequest).toBe('request-next');
  });

});

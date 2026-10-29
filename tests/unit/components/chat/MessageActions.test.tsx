import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageActions } from '../../../../components/chat/MessageActions';
import { MessageList } from '../../../../components/chat/MessageList';
import type { ChatMessage } from '../../../../shared/types/chat';

describe('MessageActions', () => {
  it('copies the plain response content', async () => {
    const user = userEvent.setup();
    const copyText = vi.fn(async () => undefined);
    render(<MessageActions content={'**结论**\n\n第二行'} copyText={copyText} />);

    await user.click(screen.getByRole('button', { name: '复制回答' }));
    expect(copyText).toHaveBeenCalledWith('**结论**\n\n第二行');
    expect(await screen.findByText('已复制')).toBeInTheDocument();
  });

  it('targets retry at the user turn that produced the failed answer', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <MessageActions
        content="部分回答"
        retryUserMessageId="user-turn-2"
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByRole('button', { name: '重试回答' }));
    expect(onRetry).toHaveBeenCalledWith('user-turn-2');
  });

  it('retains partial failed and cancelled content while exposing retry for the correct turn', () => {
    const messages: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: '第一个问题', status: 'complete', createdAt: 1 },
      { id: 'assistant-1', role: 'assistant', content: '失败前的部分', status: 'failed', error: { code: 'STREAM_INTERRUPTED', message: '中断', retryable: true }, createdAt: 2 },
      { id: 'user-2', role: 'user', content: '第二个问题', status: 'complete', createdAt: 3 },
      { id: 'assistant-2', role: 'assistant', content: '停止前的部分', status: 'cancelled', createdAt: 4 },
    ];
    const onRetry = vi.fn();
    render(<MessageList messages={messages} onRetry={onRetry} />);

    expect(screen.getByText('失败前的部分')).toBeInTheDocument();
    expect(screen.getByText('停止前的部分')).toBeInTheDocument();
    const retryButtons = screen.getAllByRole('button', { name: '重试回答' });
    expect(retryButtons).toHaveLength(2);
    expect(retryButtons[0]).toHaveAttribute('data-retry-message-id', 'user-1');
    expect(retryButtons[1]).toHaveAttribute('data-retry-message-id', 'user-2');
  });
});

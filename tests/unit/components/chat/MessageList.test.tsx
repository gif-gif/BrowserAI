import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageList } from '../../../../components/chat/MessageList';
import type { ChatMessage } from '../../../../shared/types/chat';

const base = { createdAt: 1 };
const messages: ChatMessage[] = [
  { ...base, id: 'user', role: 'user', content: '请总结页面', status: 'complete' },
  { ...base, id: 'streaming', role: 'assistant', content: '正在整理', status: 'streaming' },
  { ...base, id: 'cancelled', role: 'assistant', content: '已生成的部分', status: 'cancelled' },
  {
    ...base,
    id: 'failed',
    role: 'assistant',
    content: '',
    status: 'failed',
    error: { code: 'GATEWAY_UNAVAILABLE', message: 'Gateway 暂时不可用', retryable: true },
  },
];

describe('MessageList', () => {
  it('shows complete, streaming, cancelled, and failed message states', () => {
    render(<MessageList messages={messages} />);

    expect(screen.getByText('请总结页面')).toBeInTheDocument();
    expect(screen.getByText('正在生成')).toBeInTheDocument();
    expect(screen.getByText('已停止生成')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Gateway 暂时不可用');
  });

  it('renders generated images from trusted structured attachments without cropping styles', () => {
    render(<MessageList messages={[{
      ...base,
      id: 'generated',
      role: 'assistant',
      content: '',
      status: 'complete',
      attachments: [{
        id: 'generated-image',
        name: 'generated-image-1.png',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        source: 'generated',
      }],
    }]} />);

    const image = screen.getByRole('img', { name: 'generated-image-1.png' });
    expect(image).toHaveAttribute('src', 'data:image/png;base64,aGVsbG8=');
    expect(image).toHaveClass('message__attachment-image--generated');
  });

  it('batches streaming text updates into an animation frame', () => {
    let flushFrame: FrameRequestCallback | undefined;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      flushFrame = callback;
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const first: ChatMessage = {
      ...base,
      id: 'stream',
      role: 'assistant',
      content: '第一段',
      status: 'streaming',
    };
    const { rerender } = render(<MessageList messages={[first]} />);
    rerender(<MessageList messages={[{ ...first, content: '第一段第二段' }]} />);

    expect(screen.getByText('第一段')).toBeInTheDocument();
    expect(screen.queryByText('第一段第二段')).not.toBeInTheDocument();
    expect(requestFrame).toHaveBeenCalledTimes(1);

    act(() => flushFrame?.(16));
    expect(screen.getByText('第一段第二段')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('shows source metadata without exposing the full URL as visible chrome', () => {
    render(
      <MessageList
        messages={[{
          ...base,
          id: 'answer',
          role: 'assistant',
          content: '核心结论',
          status: 'complete',
          source: {
            pageTitle: '示例文章',
            pageUrl: 'https://example.com/private?q=secret',
            contextTypes: ['page', 'selection'],
            pageTruncated: true,
          },
        }]}
      />,
    );

    expect(screen.getByText(/来源：示例文章/)).toBeInTheDocument();
    expect(screen.getByText(/当前页 · 选中文本 · 已截断/)).toBeInTheDocument();
    expect(screen.queryByText(/private\?q=secret/)).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageActions } from '../../../../components/chat/MessageActions';
import { MessageList } from '../../../../components/chat/MessageList';
import { SlideDeckCard } from '../../../../components/chat/SlideDeckCard';
import type { ChatMessage } from '../../../../shared/types/chat';

const deck = { title: '季度回顾', slides: [{ title: '背景', bullets: ['目标'] }, { title: '下一步', bullets: [] }] };
const answer = `这是演示文稿。\n\n\`\`\`slides\n${JSON.stringify(deck)}\n\`\`\``;

describe('slide deck answers', () => {
  it('shows the outline as a download card instead of raw JSON', () => {
    const messages: ChatMessage[] = [{ id: 'a', role: 'assistant', content: answer, status: 'complete', createdAt: 1 }];
    render(<MessageList messages={messages} />);

    expect(screen.getByText('这是演示文稿。')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '演示文稿' })).toHaveTextContent('3 页幻灯片');
    expect(screen.getByRole('button', { name: '下载 PPT：季度回顾' })).toBeInTheDocument();
    expect(screen.queryByText(/"slides"/)).not.toBeInTheDocument();
  });

  it('shows progress while the block streams and an error when it is malformed', () => {
    const { rerender } = render(<SlideDeckCard pending />);
    expect(screen.getByRole('status')).toHaveTextContent('正在生成幻灯片大纲');
    rerender(<SlideDeckCard />);
    expect(screen.getByRole('alert')).toHaveTextContent('幻灯片大纲格式有误');
  });

  it('builds the deck with the theme color and reports failures', async () => {
    const user = userEvent.setup();
    const savePptx = vi.fn(async () => undefined);
    const { rerender } = render(<SlideDeckCard deck={deck} savePptx={savePptx} />);
    await user.click(screen.getByRole('button', { name: '下载 PPT：季度回顾' }));
    expect(savePptx).toHaveBeenCalledWith(deck, '#0b57d0');

    rerender(<SlideDeckCard deck={deck} savePptx={vi.fn(async () => { throw new Error('boom'); })} />);
    await user.click(screen.getByRole('button', { name: '下载 PPT：季度回顾' }));
    expect(await screen.findByText('生成 PPT 失败，请重试')).toBeInTheDocument();
  });

  it('exports an answer as PDF through the print page', async () => {
    const user = userEvent.setup();
    const exportPdf = vi.fn(async () => undefined);
    render(<MessageActions content="# 结论" exportPdf={exportPdf} />);
    await user.click(screen.getByRole('button', { name: '将回答导出为 PDF' }));
    expect(exportPdf).toHaveBeenCalledWith('# 结论', 'Browser AI');
  });
});

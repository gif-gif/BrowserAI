import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HistoryDrawer } from '../../../../components/history/HistoryDrawer';
import type { Conversation } from '../../../../shared/types/chat';

function conversation(id: string, updatedAt: number, pinned = false): Conversation {
  return { id, title: `对话 ${id}`, messages: [], providerId: 'p1', model: 'm1', promptVersion: 'v1', pinned, createdAt: 1, updatedAt };
}

describe('HistoryDrawer', () => {
  it('sorts newest first and supports open, pin, delete, and clear-all actions', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onPin = vi.fn();
    const onDelete = vi.fn();
    const onClearAll = vi.fn();
    render(
      <HistoryDrawer
        open
        conversations={[conversation('old', 1), conversation('new', 3), conversation('pinned', 2, true)]}
        activeConversationId="new"
        retentionDays={30}
        onClose={vi.fn()}
        onOpenConversation={onOpen}
        onPinConversation={onPin}
        onDeleteConversation={onDelete}
        onClearAll={onClearAll}
        onRequestRetentionChange={vi.fn(async (retentionDays) => ({ requiresConfirmation: false, affectedCount: 0, retentionDays }))}
      />,
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.getAttribute('data-conversation-id'))).toEqual(['new', 'pinned', 'old']);

    await user.click(screen.getByRole('button', { name: '打开对话 old' }));
    await user.click(screen.getByRole('button', { name: '固定对话 old' }));
    await user.click(screen.getByRole('button', { name: '删除对话 old' }));
    await user.click(screen.getByRole('button', { name: '清空未固定历史' }));
    expect(onOpen).toHaveBeenCalledWith('old');
    expect(onPin).toHaveBeenCalledWith('old', true);
    expect(onDelete).toHaveBeenCalledWith('old');
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('previews a shorter retention and requires explicit confirmation', async () => {
    const user = userEvent.setup();
    const requestChange = vi.fn()
      .mockResolvedValueOnce({ requiresConfirmation: true, affectedCount: 4, retentionDays: 7 })
      .mockResolvedValueOnce({ requiresConfirmation: false, affectedCount: 4, retentionDays: 7 });
    render(
      <HistoryDrawer
        open
        conversations={[]}
        retentionDays={30}
        onClose={vi.fn()}
        onOpenConversation={vi.fn()}
        onPinConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        onClearAll={vi.fn()}
        onRequestRetentionChange={requestChange}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: '历史保留时间' }));
    await user.click(screen.getByRole('option', { name: '7 天' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('将删除 4 个对话');
    expect(requestChange).toHaveBeenNthCalledWith(1, 7, false);

    await user.click(screen.getByRole('button', { name: '确认缩短保留时间' }));
    expect(requestChange).toHaveBeenNthCalledWith(2, 7, true);
  });
});

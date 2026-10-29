import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AttachmentLimitSettings } from '../../../components/settings/AttachmentLimitSettings';
import type { RuntimeCommand } from '../../../messaging/contracts';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';

function renderSettings(
  send: (command: RuntimeCommand) => Promise<unknown>,
  onChanged = vi.fn(),
) {
  render(
    <I18nProvider locale="zh-CN">
      <AttachmentLimitSettings runtime={{ send }} onChanged={onChanged} />
    </I18nProvider>,
  );
  return { onChanged };
}

describe('AttachmentLimitSettings', () => {
  it('loads the 5 MB default and saves a selected per-file limit', async () => {
    const send = vi.fn(async (command: RuntimeCommand) => {
      if (command.type === 'GET_ATTACHMENT_LIMIT') return { attachmentMaxBytes: 5 * 1024 * 1024 };
      if (command.type === 'SET_ATTACHMENT_LIMIT') return { attachmentMaxBytes: command.attachmentMaxBytes };
      return undefined;
    });
    const { onChanged } = renderSettings(send);

    const select = await screen.findByRole('combobox', { name: '附件大小限制' });
    await waitFor(() => expect(select).toHaveTextContent('单个文件 5 MB（默认）'));
    const user = userEvent.setup();
    await user.click(select);
    await user.click(screen.getByRole('option', { name: '单个文件 10 MB' }));

    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SET_ATTACHMENT_LIMIT',
      attachmentMaxBytes: 10 * 1024 * 1024,
    })));
    expect(select).toHaveTextContent('单个文件 10 MB');
    expect(onChanged).toHaveBeenLastCalledWith(10 * 1024 * 1024);
  });

  it('restores the previous value when saving fails', async () => {
    const send = vi.fn(async (command: RuntimeCommand) => {
      if (command.type === 'GET_ATTACHMENT_LIMIT') return { attachmentMaxBytes: 5 * 1024 * 1024 };
      throw new Error('storage unavailable');
    });
    renderSettings(send);

    const select = await screen.findByRole('combobox', { name: '附件大小限制' });
    await waitFor(() => expect(select).not.toBeDisabled());
    const user = userEvent.setup();
    await user.click(select);
    await user.click(screen.getByRole('option', { name: '单个文件 20 MB' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('无法保存附件大小限制');
    expect(select).toHaveTextContent('单个文件 5 MB');
  });
});

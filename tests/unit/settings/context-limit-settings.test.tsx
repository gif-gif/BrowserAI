import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContextLimitSettings } from '../../../components/settings/ContextLimitSettings';
import type { RuntimeCommand } from '../../../messaging/contracts';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';

function renderSettings(send: (command: RuntimeCommand) => Promise<unknown>) {
  render(
    <I18nProvider locale="zh-CN">
      <ContextLimitSettings runtime={{ send }} />
    </I18nProvider>,
  );
}

describe('ContextLimitSettings', () => {
  it('loads the saved limit and saves a selected preset', async () => {
    const send = vi.fn(async (command: RuntimeCommand) => {
      if (command.type === 'GET_CONTEXT_LIMIT') return { documentCharacters: 40_000 };
      if (command.type === 'SET_CONTEXT_LIMIT') return { documentCharacters: command.documentCharacters };
      return undefined;
    });
    renderSettings(send);

    const select = await screen.findByRole('combobox', { name: '页面上下文限制' });
    await waitFor(() => expect(select).toHaveTextContent('40,000 字符（默认）'));
    const user = userEvent.setup();
    await user.click(select);
    await user.click(screen.getByRole('option', { name: '80,000 字符' }));

    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SET_CONTEXT_LIMIT',
      documentCharacters: 80_000,
    })));
    expect(select).toHaveTextContent('80,000 字符');
  });

  it('restores the previous value when saving fails', async () => {
    const send = vi.fn(async (command: RuntimeCommand) => {
      if (command.type === 'GET_CONTEXT_LIMIT') return { documentCharacters: 40_000 };
      throw new Error('storage unavailable');
    });
    renderSettings(send);

    const select = await screen.findByRole('combobox', { name: '页面上下文限制' });
    await waitFor(() => expect(select).not.toBeDisabled());
    const user = userEvent.setup();
    await user.click(select);
    await user.click(screen.getByRole('option', { name: '120,000 字符' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('无法保存页面上下文限制');
    expect(select).toHaveTextContent('40,000 字符');
  });
});

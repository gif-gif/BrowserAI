import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewChatShortcutSettings } from '../../../components/settings/NewChatShortcutSettings';
import { STORAGE_KEYS } from '../../../shared/constants/storage-keys';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';
import { DEFAULT_NEW_CHAT_SHORTCUTS, resolveNewChatShortcuts } from '../../../shared/new-chat-shortcuts/preference';
import type { Skill } from '../../../shared/types/skill';

afterEach(() => vi.unstubAllGlobals());

const skills: Skill[] = [{ id: 'skill-1', name: '周报', prompt: '整理成周报', createdAt: 1, updatedAt: 1 }];

describe('new chat shortcuts', () => {
  it('falls back to the quick actions, drops invalid entries and keeps repeats', () => {
    expect(resolveNewChatShortcuts(undefined)).toEqual(DEFAULT_NEW_CHAT_SHORTCUTS);
    expect(resolveNewChatShortcuts([
      { type: 'skill', id: 'skill-1' },
      { type: 'skill', id: 'skill-1' },
      { type: 'action', id: 'unknown' },
      { type: 'action', id: 'translate' },
      'bad',
    ])).toEqual([{ type: 'skill', id: 'skill-1' }, { type: 'skill', id: 'skill-1' }, { type: 'action', id: 'translate' }]);
    expect(resolveNewChatShortcuts([])).toEqual([]);
  });

  it('replaces a shortcut with a saved skill, clears one and restores the defaults', async () => {
    const user = userEvent.setup();
    const set = vi.fn(async () => undefined);
    vi.stubGlobal('browser', { storage: { local: { get: vi.fn(async () => ({})), set } } });
    render(
      <I18nProvider locale="zh-CN">
        <NewChatShortcutSettings skills={skills} shortcuts={DEFAULT_NEW_CHAT_SHORTCUTS} />
      </I18nProvider>,
    );

    const pick = async (slot: number, option: string) => {
      await user.click(screen.getByRole('combobox', { name: `快捷方式 ${slot}` }));
      await user.click(screen.getByRole('option', { name: option }));
    };
    expect(screen.getByRole('combobox', { name: '快捷方式 2' })).toHaveTextContent('解释');
    await pick(2, '周报');
    expect(set).toHaveBeenLastCalledWith({ [STORAGE_KEYS.newChatShortcuts]: [
      { type: 'action', id: 'summarize' },
      { type: 'skill', id: 'skill-1' },
      { type: 'action', id: 'translate' },
      { type: 'action', id: 'tech-stack' },
    ] });

    await pick(1, '不显示');
    expect(set).toHaveBeenLastCalledWith({ [STORAGE_KEYS.newChatShortcuts]: [
      { type: 'skill', id: 'skill-1' },
      { type: 'action', id: 'translate' },
      { type: 'action', id: 'tech-stack' },
    ] });
    await waitFor(() => expect(screen.getByRole('combobox', { name: '快捷方式 4' })).toHaveTextContent('不显示'));

    await pick(2, '周报');
    expect(set).toHaveBeenLastCalledWith({ [STORAGE_KEYS.newChatShortcuts]: [
      { type: 'skill', id: 'skill-1' },
      { type: 'skill', id: 'skill-1' },
      { type: 'action', id: 'tech-stack' },
    ] });
    await waitFor(() => expect(screen.getByRole('combobox', { name: '快捷方式 1' })).toHaveTextContent('周报'));
    expect(screen.getByRole('combobox', { name: '快捷方式 2' })).toHaveTextContent('周报');

    await user.click(screen.getByRole('button', { name: '恢复默认' }));
    expect(set).toHaveBeenLastCalledWith({ [STORAGE_KEYS.newChatShortcuts]: DEFAULT_NEW_CHAT_SHORTCUTS });
  });
});

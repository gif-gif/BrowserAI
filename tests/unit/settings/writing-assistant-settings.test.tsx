import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WritingAssistantSettings } from '../../../components/settings/WritingAssistantSettings';
import { STORAGE_KEYS } from '../../../shared/constants/storage-keys';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';
import {
  loadWritingAssistantEnabled,
  resolveWritingAssistantEnabled,
} from '../../../shared/writing-assistant/preference';

afterEach(() => vi.unstubAllGlobals());

describe('WritingAssistantSettings', () => {
  it('defaults invalid or missing preferences to enabled', async () => {
    vi.stubGlobal('browser', {
      storage: {
        local: { get: vi.fn(async () => ({})) },
      },
    });

    expect(resolveWritingAssistantEnabled(undefined)).toBe(true);
    expect(resolveWritingAssistantEnabled('false')).toBe(true);
    expect(resolveWritingAssistantEnabled(false)).toBe(false);
    await expect(loadWritingAssistantEnabled()).resolves.toBe(true);
  });

  it('loads, persists, and synchronizes the launcher preference', async () => {
    const user = userEvent.setup();
    const set = vi.fn(async () => undefined);
    const listeners = new Set<(changes: Record<string, { newValue?: unknown }>, area: string) => void>();
    vi.stubGlobal('browser', {
      storage: {
        local: {
          get: vi.fn(async () => ({ [STORAGE_KEYS.writingAssistantEnabled]: false })),
          set,
        },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => listeners.add(listener),
          removeListener: (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => listeners.delete(listener),
        },
      },
    });

    render(
      <I18nProvider locale="zh-CN">
        <WritingAssistantSettings />
      </I18nProvider>,
    );

    const toggle = screen.getByRole('switch', { name: '自动显示写作助手图标' });
    await waitFor(() => expect(toggle).not.toBeChecked());

    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.writingAssistantEnabled]: true });

    act(() => {
      listeners.forEach((listener) => listener({
        [STORAGE_KEYS.writingAssistantEnabled]: { newValue: false },
      }, 'local'));
    });
    expect(toggle).not.toBeChecked();
  });
});

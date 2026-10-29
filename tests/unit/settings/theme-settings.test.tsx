import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelHeader } from '../../../components/layout/PanelHeader';
import { ThemeSettings } from '../../../components/settings/ThemeSettings';
import { STORAGE_KEYS } from '../../../shared/constants/storage-keys';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { THEMES } from '../../../shared/theme/theme';

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.removeProperty('--blue');
  document.documentElement.style.removeProperty('--blue-hover');
  document.documentElement.style.removeProperty('--blue-soft');
  document.documentElement.style.removeProperty('--focus-ring');
});

describe('ThemeSettings', () => {
  it('offers the default color plus twenty additional theme colors', () => {
    expect(THEMES).toHaveLength(21);
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(21);
  });

  it('loads, applies, persists, and synchronizes a selected theme', async () => {
    const user = userEvent.setup();
    const set = vi.fn(async () => undefined);
    const listeners = new Set<(changes: Record<string, { newValue?: unknown }>, area: string) => void>();
    vi.stubGlobal('browser', {
      storage: {
        local: {
          get: vi.fn(async () => ({ [STORAGE_KEYS.themePreference]: 'violet' })),
          set,
        },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => listeners.add(listener),
          removeListener: (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => listeners.delete(listener),
        },
      },
    });

    render(
      <I18nProvider locale="en">
        <ThemeProvider>
          <ThemeSettings />
        </ThemeProvider>
      </I18nProvider>,
    );

    const violet = await screen.findByRole('radio', { name: 'Violet' });
    await waitFor(() => expect(violet).toHaveAttribute('aria-checked', 'true'));
    expect(document.documentElement.dataset.theme).toBe('violet');
    expect(document.documentElement.style.getPropertyValue('--blue')).toBe('#7c3aed');

    await user.click(screen.getByRole('radio', { name: 'Green' }));
    expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.themePreference]: 'green' });
    expect(document.documentElement.dataset.theme).toBe('green');

    act(() => {
      listeners.forEach((listener) => listener({
        [STORAGE_KEYS.themePreference]: { newValue: 'teal' },
      }, 'local'));
    });
    expect(screen.getByRole('radio', { name: 'Teal' })).toHaveAttribute('aria-checked', 'true');
  });

  it('cycles to the next theme from the panel header shortcut', async () => {
    const user = userEvent.setup();
    const set = vi.fn(async () => undefined);
    vi.stubGlobal('browser', {
      storage: {
        local: {
          get: vi.fn(async () => ({ [STORAGE_KEYS.themePreference]: 'blue' })),
          set,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    });

    render(
      <I18nProvider locale="zh-CN">
        <ThemeProvider>
          <PanelHeader />
        </ThemeProvider>
      </I18nProvider>,
    );

    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByRole('menuitem', { name: '切换主题颜色' }));

    await waitFor(() => expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.themePreference]: 'indigo' }));
    expect(document.documentElement.dataset.theme).toBe('indigo');
  });
});

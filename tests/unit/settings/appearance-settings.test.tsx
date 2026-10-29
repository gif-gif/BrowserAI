import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelHeader } from '../../../components/layout/PanelHeader';
import { AppearanceSettings } from '../../../components/settings/AppearanceSettings';
import { STORAGE_KEYS } from '../../../shared/constants/storage-keys';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { resolveAppearance } from '../../../shared/theme/appearance';
import { getTheme, getThemeTokens } from '../../../shared/theme/theme';

type StorageListener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

function stubColorScheme(initiallyDark: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: initiallyDark,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => query));
  return (dark: boolean) => {
    query.matches = dark;
    listeners.forEach((listener) => listener());
  };
}

function stubStorage(stored: Record<string, unknown>) {
  const set = vi.fn(async () => undefined);
  const listeners = new Set<StorageListener>();
  vi.stubGlobal('browser', {
    storage: {
      local: { get: vi.fn(async () => stored), set },
      onChanged: {
        addListener: (listener: StorageListener) => listeners.add(listener),
        removeListener: (listener: StorageListener) => listeners.delete(listener),
      },
    },
  });
  return { set, emit: (changes: Record<string, { newValue?: unknown }>) => listeners.forEach((listener) => listener(changes, 'local')) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  const root = document.documentElement;
  delete root.dataset.theme;
  delete root.dataset.appearance;
  root.style.removeProperty('color-scheme');
  ['--blue', '--blue-hover', '--blue-soft', '--focus-ring'].forEach((name) => root.style.removeProperty(name));
});

describe('appearance', () => {
  it('resolves follow-Chrome against the browser color scheme', () => {
    expect(resolveAppearance('system', true)).toBe('dark');
    expect(resolveAppearance('system', false)).toBe('light');
    expect(resolveAppearance('light', true)).toBe('light');
    expect(resolveAppearance('dark', false)).toBe('dark');
  });

  it('keeps the swatch accent in light mode and lifts it on dark surfaces', () => {
    const blue = getTheme('blue');
    expect(getThemeTokens(blue, 'light').color).toBe(blue.color);
    expect(getThemeTokens(blue, 'dark').color).toContain('color-mix');
    expect(getThemeTokens(blue, 'dark').color).toContain(blue.color);
  });

  it('follows Chrome by default and switches live when Chrome changes mode', async () => {
    const setDark = stubColorScheme(true);
    stubStorage({});

    render(
      <I18nProvider locale="en">
        <ThemeProvider>
          <AppearanceSettings />
        </ThemeProvider>
      </I18nProvider>,
    );

    expect(screen.getByRole('combobox', { name: 'Appearance' })).toHaveTextContent('Follow browser');
    expect(document.documentElement.dataset.appearance).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    act(() => setDark(false));
    expect(document.documentElement.dataset.appearance).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--blue')).toBe('#0b57d0');
  });

  it('saves a fixed choice from Settings and syncs changes from other pages', async () => {
    const user = userEvent.setup();
    stubColorScheme(false);
    const { set, emit } = stubStorage({ [STORAGE_KEYS.appearancePreference]: 'system' });

    render(
      <I18nProvider locale="en">
        <ThemeProvider>
          <AppearanceSettings />
        </ThemeProvider>
      </I18nProvider>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Appearance' }));
    await user.click(screen.getByRole('option', { name: 'Dark' }));
    expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.appearancePreference]: 'dark' });
    expect(document.documentElement.dataset.appearance).toBe('dark');

    act(() => emit({ [STORAGE_KEYS.appearancePreference]: { newValue: 'light' } }));
    expect(document.documentElement.dataset.appearance).toBe('light');
    expect(screen.getByRole('combobox', { name: 'Appearance' })).toHaveTextContent('Light');
  });

  it('picks light, dark, or follow browser from the header button next to history', async () => {
    const user = userEvent.setup();
    stubColorScheme(true);
    const { set } = stubStorage({});

    render(
      <I18nProvider locale="zh-CN">
        <ThemeProvider>
          <PanelHeader />
        </ThemeProvider>
      </I18nProvider>,
    );

    const actions = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(actions.indexOf('外观')).toBe(actions.indexOf('历史记录') + 1);

    const appearance = screen.getByRole('button', { name: '外观' });
    await user.click(appearance);
    expect(appearance).toHaveAttribute('aria-expanded', 'true');
    const system = screen.getByRole('menuitemradio', { name: '跟随浏览器' });
    expect(system).toHaveAttribute('aria-checked', 'true');
    expect(system).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(appearance).toHaveFocus();

    await user.click(appearance);
    await user.click(screen.getByRole('menuitemradio', { name: '浅色' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.appearancePreference]: 'light' }));
    expect(document.documentElement.dataset.appearance).toBe('light');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '更多操作' }));
    expect(screen.queryByRole('menuitem', { name: /深色模式|浅色模式/ })).not.toBeInTheDocument();
  });
});

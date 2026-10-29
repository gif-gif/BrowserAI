import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelHeader } from '../../../components/layout/PanelHeader';
import { LanguageSettings } from '../../../components/settings/LanguageSettings';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';
import {
  resolveLanguagePreference,
} from '../../../shared/i18n/language-preference';
import { STORAGE_KEYS } from '../../../shared/constants/storage-keys';

afterEach(() => vi.unstubAllGlobals());

describe('language preferences', () => {
  it('follows Chrome in auto mode and lets manual choices override it', () => {
    expect(resolveLanguagePreference('auto', 'zh-TW')).toBe('zh-TW');
    expect(resolveLanguagePreference('auto', 'de-DE')).toBe('en');
    expect(resolveLanguagePreference('zh-CN', 'en-US')).toBe('zh-CN');
    expect(resolveLanguagePreference('zh-TW', 'en-US')).toBe('zh-TW');
    expect(resolveLanguagePreference('en', 'zh-CN')).toBe('en');
  });

  it('keeps the display language out of the panel header', () => {
    render(
      <I18nProvider>
        <PanelHeader />
      </I18nProvider>,
    );

    expect(screen.queryByRole('button', { name: '显示语言' })).not.toBeInTheDocument();
  });

  it('loads, switches, and persists the display language', async () => {
    const set = vi.fn(async () => undefined);
    const listeners = new Set<(changes: Record<string, { newValue?: unknown }>, area: string) => void>();
    vi.stubGlobal('browser', {
      i18n: { getUILanguage: () => 'en-US' },
      storage: {
        local: {
          get: vi.fn(async () => ({ [STORAGE_KEYS.languagePreference]: 'zh-CN' })),
          set,
        },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => listeners.add(listener),
          removeListener: (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => listeners.delete(listener),
        },
      },
    });

    render(
      <I18nProvider>
        <LanguageSettings />
      </I18nProvider>,
    );

    const select = await screen.findByRole('combobox', { name: '显示语言' });
    expect(select).toHaveTextContent('简体中文');

    fireEvent.click(select);
    fireEvent.click(screen.getByRole('option', { name: 'English' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Display language' })).toBeInTheDocument());
    expect(document.documentElement.lang).toBe('en');
    expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.languagePreference]: 'en' });

    act(() => {
      listeners.forEach((listener) => listener({
        [STORAGE_KEYS.languagePreference]: { newValue: 'zh-CN' },
      }, 'local'));
    });
    expect(await screen.findByRole('heading', { name: '显示语言' })).toBeInTheDocument();
  });
});

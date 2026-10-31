import { describe, expect, it, vi } from 'vitest';
import {
  claimContentScriptInstance,
  releaseContentScriptInstance,
  resolveWritingAssistantPreferences,
  resolveWritingLocale,
  watchForOrphanedScript,
} from '../../../entrypoints/content';

describe('content script instance guard', () => {
  it('allows only one live controller per isolated page world', () => {
    const scope = {};
    expect(claimContentScriptInstance(scope)).toBe(true);
    expect(claimContentScriptInstance(scope)).toBe(false);
    releaseContentScriptInstance(scope);
    expect(claimContentScriptInstance(scope)).toBe(true);
  });

  it('tears down on the first interaction after the extension is reloaded, before page features see it', () => {
    let orphaned = false;
    const isOrphaned = vi.fn(() => orphaned);
    const pageFeature = vi.fn();
    document.addEventListener('focusin', pageFeature, true);
    watchForOrphanedScript(window, isOrphaned);

    document.body.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(isOrphaned).toHaveBeenCalledTimes(1);

    orphaned = true;
    const order: string[] = [];
    isOrphaned.mockImplementation(() => { order.push('check'); return true; });
    pageFeature.mockImplementation(() => order.push('feature'));
    document.body.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(order).toEqual(['check', 'feature']);

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(isOrphaned).toHaveBeenCalledTimes(2);
    document.removeEventListener('focusin', pageFeature, true);
  });

  it('normalizes writing assistant preferences received from the trusted background', () => {
    expect(resolveWritingAssistantPreferences({
      languagePreference: 'zh-TW',
      themePreference: 'violet',
      appearancePreference: 'dark',
      writingAssistantEnabled: false,
    })).toEqual({
      languagePreference: 'zh-TW',
      themePreference: 'violet',
      appearancePreference: 'dark',
      writingAssistantEnabled: false,
    });
    expect(resolveWritingAssistantPreferences({
      languagePreference: 'invalid',
      themePreference: 'invalid',
      appearancePreference: 'dim',
      writingAssistantEnabled: 'no',
    })).toEqual({
      languagePreference: 'auto',
      themePreference: 'blue',
      appearancePreference: 'system',
      writingAssistantEnabled: true,
    });
  });

  it('resolves writing assistant locale from the saved UI language preference', () => {
    expect(resolveWritingLocale('en', 'zh-CN')).toBe('en');
    expect(resolveWritingLocale('zh-TW', 'en-US')).toBe('zh-TW');
    expect(resolveWritingLocale('auto', 'zh-CN')).toBe('zh-CN');
    expect(resolveWritingLocale(undefined, 'fr-FR')).toBe('en');
  });
});

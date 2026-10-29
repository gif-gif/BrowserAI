import { describe, expect, it } from 'vitest';
import {
  claimContentScriptInstance,
  releaseContentScriptInstance,
  resolveWritingAssistantPreferences,
  resolveWritingLocale,
} from '../../../entrypoints/content';

describe('content script instance guard', () => {
  it('allows only one live controller per isolated page world', () => {
    const scope = {};
    expect(claimContentScriptInstance(scope)).toBe(true);
    expect(claimContentScriptInstance(scope)).toBe(false);
    releaseContentScriptInstance(scope);
    expect(claimContentScriptInstance(scope)).toBe(true);
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

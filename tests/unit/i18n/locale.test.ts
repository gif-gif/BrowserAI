import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectLocale, getMessages, localizeError, resolveLocale } from '../../../shared/i18n/locale';

afterEach(() => vi.unstubAllGlobals());

describe('locale resolution', () => {
  it.each([
    ['zh-CN', 'zh-CN'],
    ['zh-SG', 'zh-CN'],
    ['zh-TW', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['zh-Hant', 'zh-TW'],
    ['en-US', 'en'],
    ['fr-FR', 'en'],
    [undefined, 'en'],
  ] as const)('maps %s to %s', (language, expected) => {
    expect(resolveLocale(language)).toBe(expected);
  });

  it('prefers the Chrome UI language over navigator.language', () => {
    vi.stubGlobal('browser', { i18n: { getUILanguage: () => 'en-US' } });
    expect(detectLocale()).toBe('en');
  });

  it('provides English UI and prompt text', () => {
    const messages = getMessages('en');
    expect(messages.askAi).toBe('Ask AI');
    expect(messages.greetings).toHaveLength(6);
    expect(messages.greetings[0]).toBe('What would you like to know?');
    expect(messages.quickActions.find((action) => action.id === 'summarize')?.prompt).toMatch(/^Summarize/);
  });

  it('localizes the writing assistant title and rewrite errors', () => {
    expect(getMessages('zh-CN').writingAssistantTitle).toBe('AI 写作助手');
    expect(getMessages('zh-TW').writingAssistantTitle).toBe('AI 寫作助理');
    expect(getMessages('en').writingAssistantTitle).toBe('AI Writing Assistant');

    const error = { code: 'WRITING_ASSISTANT_REQUIREMENTS_NOT_MET' as const, message: '后端中文错误' };
    expect(localizeError(error, getMessages('en'))).toContain('requested rewrite requirements');
    expect(localizeError(error, getMessages('zh-TW'))).toContain('潤飾要求');
  });

  it('provides Traditional Chinese UI and prompt text', () => {
    const messages = getMessages('zh-TW');
    expect(messages.settings).toBe('設定');
    expect(messages.traditionalChinese).toBe('繁體中文');
    expect(messages.quickActions.find((action) => action.id === 'translate')?.prompt).toContain('繁體中文');
  });
});

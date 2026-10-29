import { describe, expect, it } from 'vitest';
import { isTextModel, pickDefaultModel } from '../../../core/settings/default-model';

describe('pickDefaultModel', () => {
  it('picks the first Claude / GPT / Gemini text model in Gateway order', () => {
    expect(pickDefaultModel(['text-embedding-3-small', 'llama-3', 'claude-sonnet-4', 'gpt-4o'])).toBe('claude-sonnet-4');
    expect(pickDefaultModel(['whisper-1', 'gpt-4o-mini-tts', 'gpt-4o', 'gemini-pro'])).toBe('gpt-4o');
    expect(pickDefaultModel(['imagen-3', 'gemini-2.5-flash'])).toBe('gemini-2.5-flash');
  });

  it('falls back to the first text model, then to the first model', () => {
    expect(pickDefaultModel(['text-embedding-3-small', 'qwen-max', 'llama-3'])).toBe('qwen-max');
    expect(pickDefaultModel(['text-embedding-3-small', 'dall-e-3'])).toBe('text-embedding-3-small');
    expect(pickDefaultModel([' ', ''])).toBeUndefined();
    expect(pickDefaultModel([])).toBeUndefined();
  });

  it('recognizes non-text models', () => {
    expect(isTextModel('text-embedding-ada-002')).toBe(false);
    expect(isTextModel('gpt-image-1')).toBe(false);
    expect(isTextModel('omni-moderation-latest')).toBe(false);
    expect(isTextModel('claude-opus-5-5')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { toOpenAIMessages } from '../../../core/providers/openai-message-mapper';

describe('toOpenAIMessages', () => {
  it('maps domain messages to plain Chat Completions messages', () => {
    const result = toOpenAIMessages([
      { role: 'system', content: 'Follow instructions.' },
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！' },
    ]);
    expect(result).toEqual([
      { role: 'system', content: 'Follow instructions.' },
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！' },
    ]);
    expect(JSON.stringify(result)).not.toContain('createdAt');
    expect(JSON.stringify(result)).not.toContain('status');
  });

  it('preserves multimodal user content for OpenAI-compatible vision models', () => {
    const content = [
      { type: 'text' as const, text: 'Describe this image.' },
      { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,aGVsbG8=', detail: 'auto' as const } },
    ];
    expect(toOpenAIMessages([{ role: 'user', content }])).toEqual([{ role: 'user', content }]);
  });

});

import { describe, expect, it } from 'vitest';
import { toAnthropicMessages } from '../../../core/providers/anthropic-message-mapper';
import { AppError } from '../../../shared/errors/app-error';

describe('toAnthropicMessages', () => {
  it('hoists system messages into the system field', () => {
    expect(toAnthropicMessages([
      { role: 'system', content: '你是助手' },
      { role: 'system', content: '使用中文' },
      { role: 'user', content: '你好' },
    ])).toEqual({
      system: '你是助手\n\n使用中文',
      messages: [{ role: 'user', content: '你好' }],
    });
  });

  it('converts inline image data URLs to base64 image blocks', () => {
    expect(toAnthropicMessages([{
      role: 'user',
      content: [
        { type: 'text', text: '看图' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=', detail: 'auto' } },
      ],
    }]).messages).toEqual([{
      role: 'user',
      content: [
        { type: 'text', text: '看图' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } },
      ],
    }]);
  });

  it('rejects remote image URLs instead of letting the gateway fetch them', () => {
    expect(() => toAnthropicMessages([{
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'https://example.com/a.png' } }],
    }])).toThrow(AppError);
  });

  it('merges consecutive same-role turns and drops empty ones', () => {
    expect(toAnthropicMessages([
      { role: 'user', content: '第一段' },
      { role: 'assistant', content: '' },
      { role: 'user', content: '第二段' },
      { role: 'assistant', content: '回答' },
    ]).messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: '第一段' }, { type: 'text', text: '第二段' }] },
      { role: 'assistant', content: '回答' },
    ]);
  });
});

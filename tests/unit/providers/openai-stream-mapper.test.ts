import { describe, expect, it } from 'vitest';
import { mapOpenAIStreamChunk } from '../../../core/providers/openai-stream-mapper';
import { AppError } from '../../../shared/errors/app-error';

describe('mapOpenAIStreamChunk', () => {
  it('maps text deltas to normalized events without SDK fields', () => {
    expect(mapOpenAIStreamChunk({
      id: 'sdk-id',
      choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }],
    }, 'r1')).toEqual([{ type: 'delta', requestId: 'r1', text: 'hello' }]);
  });

  it('maps finish reasons to completion events', () => {
    expect(mapOpenAIStreamChunk({
      choices: [{ index: 0, delta: {}, finish_reason: 'length' }],
    }, 'r1')).toEqual([{ type: 'completed', requestId: 'r1', finishReason: 'length' }]);
  });

  it('maps compatible usage chunks', () => {
    expect(mapOpenAIStreamChunk({
      choices: [],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    }, 'r1')).toEqual([{
      type: 'usage',
      requestId: 'r1',
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
    }]);
  });

  it('rejects malformed stream chunks', () => {
    expect(() => mapOpenAIStreamChunk({ choices: 'not-an-array' }, 'r1'))
      .toThrowError(AppError);
    try {
      mapOpenAIStreamChunk({ choices: 'not-an-array' }, 'r1');
    } catch (error) {
      expect(error).toMatchObject({ code: 'STREAM_PROTOCOL_ERROR' });
    }
  });
});

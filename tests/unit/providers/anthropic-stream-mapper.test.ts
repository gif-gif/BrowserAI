import { describe, expect, it } from 'vitest';
import {
  mapAnthropicStreamEvent,
  normalizeAnthropicStopReason,
  type AnthropicStreamState,
} from '../../../core/providers/anthropic-stream-mapper';
import { AppError } from '../../../shared/errors/app-error';

describe('mapAnthropicStreamEvent', () => {
  it('maps text deltas and ignores thinking deltas', () => {
    const state: AnthropicStreamState = {};
    expect(mapAnthropicStreamEvent({
      type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello' },
    }, 'r1', state)).toEqual([{ type: 'delta', requestId: 'r1', text: 'hello' }]);
    expect(mapAnthropicStreamEvent({
      type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '...' },
    }, 'r1', state)).toEqual([]);
  });

  it('combines start and delta usage and emits completion on message_stop', () => {
    const state: AnthropicStreamState = {};
    mapAnthropicStreamEvent({
      type: 'message_start',
      message: { usage: { input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 1 } },
    }, 'r1', state);
    mapAnthropicStreamEvent({
      type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 7 },
    }, 'r1', state);
    expect(mapAnthropicStreamEvent({ type: 'message_stop' }, 'r1', state)).toEqual([
      { type: 'usage', requestId: 'r1', inputTokens: 15, outputTokens: 7, totalTokens: 22 },
      { type: 'completed', requestId: 'r1', finishReason: 'length' },
    ]);
  });

  it('surfaces mid-stream error events as retryable gateway errors', () => {
    expect(() => mapAnthropicStreamEvent({
      type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' },
    }, 'r1', {})).toThrow(expect.objectContaining({ code: 'GATEWAY_UNAVAILABLE', retryable: true }));
  });

  it('rejects malformed text deltas', () => {
    expect(() => mapAnthropicStreamEvent({
      type: 'content_block_delta', delta: { type: 'text_delta', text: 42 },
    }, 'r1', {})).toThrow(AppError);
  });

  it('normalizes stop reasons onto OpenAI-style finish reasons', () => {
    expect(normalizeAnthropicStopReason('end_turn')).toBe('stop');
    expect(normalizeAnthropicStopReason('max_tokens')).toBe('length');
    expect(normalizeAnthropicStopReason('refusal')).toBe('refusal');
  });
});

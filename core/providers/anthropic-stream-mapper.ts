import { AppError } from '../../shared/errors/app-error';
import type { ProviderStreamEvent } from './provider-adapter';

interface AnthropicUsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Tracks the usage split between `message_start` and the final `message_delta`. */
export interface AnthropicStreamState {
  inputTokens?: number;
  outputTokens?: number;
  stopReason?: string;
}

function protocolError(message: string): AppError {
  return new AppError('STREAM_PROTOCOL_ERROR', message);
}

function tokenCount(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw protocolError(`Gateway usage.${field} 无效`);
  }
  return value;
}

function readUsage(raw: unknown): AnthropicUsageLike | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') throw protocolError('Gateway 流包含无效 usage');
  const usage = raw as Record<string, unknown>;
  return {
    input_tokens: tokenCount(usage.input_tokens, 'input_tokens'),
    output_tokens: tokenCount(usage.output_tokens, 'output_tokens'),
    cache_creation_input_tokens: tokenCount(usage.cache_creation_input_tokens, 'cache_creation_input_tokens'),
    cache_read_input_tokens: tokenCount(usage.cache_read_input_tokens, 'cache_read_input_tokens'),
  };
}

function totalInput(usage: AnthropicUsageLike): number | undefined {
  const parts = [usage.input_tokens, usage.cache_creation_input_tokens, usage.cache_read_input_tokens]
    .filter((value): value is number => typeof value === 'number');
  return parts.length ? parts.reduce((sum, value) => sum + value, 0) : undefined;
}

function mergeUsage(state: AnthropicStreamState, usage: AnthropicUsageLike | undefined): void {
  if (!usage) return;
  const input = totalInput(usage);
  if (input !== undefined) state.inputTokens = input;
  if (typeof usage.output_tokens === 'number') state.outputTokens = usage.output_tokens;
}

function usageEvent(state: AnthropicStreamState, requestId: string): ProviderStreamEvent | undefined {
  if (state.inputTokens === undefined && state.outputTokens === undefined) return undefined;
  return {
    type: 'usage',
    requestId,
    ...(state.inputTokens === undefined ? {} : { inputTokens: state.inputTokens }),
    ...(state.outputTokens === undefined ? {} : { outputTokens: state.outputTokens }),
    ...(state.inputTokens === undefined || state.outputTokens === undefined
      ? {}
      : { totalTokens: state.inputTokens + state.outputTokens }),
  };
}

/** Normalizes Anthropic stop reasons onto the OpenAI-style values the rest of the app already knows. */
export function normalizeAnthropicStopReason(reason: string): string {
  if (reason === 'end_turn' || reason === 'stop_sequence') return 'stop';
  if (reason === 'max_tokens' || reason === 'model_context_window_exceeded') return 'length';
  return reason;
}

export function mapAnthropicStreamEvent(
  input: unknown,
  requestId: string,
  state: AnthropicStreamState,
): ProviderStreamEvent[] {
  if (!input || typeof input !== 'object') throw protocolError('Gateway 返回了无效的流式数据');
  const event = input as Record<string, unknown>;

  switch (event.type) {
    case 'message_start': {
      const message = event.message && typeof event.message === 'object'
        ? event.message as Record<string, unknown>
        : undefined;
      mergeUsage(state, readUsage(message?.usage));
      return [];
    }
    case 'content_block_delta': {
      const delta = event.delta && typeof event.delta === 'object'
        ? event.delta as Record<string, unknown>
        : undefined;
      if (!delta) throw protocolError('Gateway 流包含无效 delta');
      // Thinking, signature and tool-input deltas are not rendered in the chat transcript.
      if (delta.type !== 'text_delta') return [];
      if (typeof delta.text !== 'string') throw protocolError('Gateway 流包含非文本 delta');
      return delta.text ? [{ type: 'delta', requestId, text: delta.text }] : [];
    }
    case 'message_delta': {
      const delta = event.delta && typeof event.delta === 'object'
        ? event.delta as Record<string, unknown>
        : {};
      if (typeof delta.stop_reason === 'string') state.stopReason = delta.stop_reason;
      mergeUsage(state, readUsage(event.usage));
      return [];
    }
    case 'message_stop': {
      const usage = usageEvent(state, requestId);
      return [
        ...(usage ? [usage] : []),
        {
          type: 'completed',
          requestId,
          finishReason: normalizeAnthropicStopReason(state.stopReason ?? 'end_turn'),
        },
      ];
    }
    case 'error': {
      const error = event.error && typeof event.error === 'object'
        ? event.error as Record<string, unknown>
        : {};
      const message = typeof error.message === 'string' ? error.message : 'Gateway 流返回错误';
      if (error.type === 'overloaded_error' || error.type === 'api_error') {
        throw new AppError('GATEWAY_UNAVAILABLE', 'Gateway 暂时不可用', { retryable: true, cause: message });
      }
      if (error.type === 'rate_limit_error') {
        throw new AppError('RATE_LIMITED', 'Gateway 请求过于频繁，请稍后重试', { retryable: true, cause: message });
      }
      throw new AppError('UNKNOWN', 'Gateway 请求失败', { cause: message });
    }
    default:
      // message_start/content_block_start/content_block_stop/ping carry nothing to render.
      return [];
  }
}

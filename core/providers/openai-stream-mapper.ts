import { AppError } from '../../shared/errors/app-error';
import type { ProviderStreamEvent } from './provider-adapter';

interface OpenAIChoiceLike {
  delta: { content?: string | null };
  finish_reason: string | null;
}

interface OpenAIChunkLike {
  choices: OpenAIChoiceLike[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}

function protocolError(message: string): AppError {
  return new AppError('STREAM_PROTOCOL_ERROR', message);
}

function readChunk(input: unknown): OpenAIChunkLike {
  if (!input || typeof input !== 'object') throw protocolError('Gateway 返回了无效的流式数据');
  const chunk = input as Record<string, unknown>;
  if (!Array.isArray(chunk.choices)) throw protocolError('Gateway 流缺少 choices 数组');

  const choices = chunk.choices.map((rawChoice) => {
    if (!rawChoice || typeof rawChoice !== 'object') throw protocolError('Gateway 流包含无效 choice');
    const choice = rawChoice as Record<string, unknown>;
    if (!choice.delta || typeof choice.delta !== 'object') throw protocolError('Gateway 流包含无效 delta');
    const delta = choice.delta as Record<string, unknown>;
    if (delta.content !== undefined && delta.content !== null && typeof delta.content !== 'string') {
      throw protocolError('Gateway 流包含非文本 delta');
    }
    if (choice.finish_reason !== null && choice.finish_reason !== undefined && typeof choice.finish_reason !== 'string') {
      throw protocolError('Gateway 流包含无效 finish_reason');
    }
    return {
      delta: { content: delta.content as string | null | undefined },
      finish_reason: (choice.finish_reason ?? null) as string | null,
    };
  });

  let usage: OpenAIChunkLike['usage'];
  if (chunk.usage !== undefined && chunk.usage !== null) {
    if (typeof chunk.usage !== 'object') throw protocolError('Gateway 流包含无效 usage');
    const rawUsage = chunk.usage as Record<string, unknown>;
    for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens'] as const) {
      const value = rawUsage[key];
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        throw protocolError(`Gateway usage.${key} 无效`);
      }
    }
    usage = {
      ...(rawUsage.prompt_tokens === undefined ? {} : { prompt_tokens: rawUsage.prompt_tokens as number }),
      ...(rawUsage.completion_tokens === undefined ? {} : { completion_tokens: rawUsage.completion_tokens as number }),
      ...(rawUsage.total_tokens === undefined ? {} : { total_tokens: rawUsage.total_tokens as number }),
    };
  }

  return { choices, ...(usage === undefined ? {} : { usage }) };
}

export function mapOpenAIStreamChunk(input: unknown, requestId: string): ProviderStreamEvent[] {
  const chunk = readChunk(input);
  const events: ProviderStreamEvent[] = [];

  for (const choice of chunk.choices) {
    if (choice.delta.content) {
      events.push({ type: 'delta', requestId, text: choice.delta.content });
    }
    if (choice.finish_reason) {
      events.push({ type: 'completed', requestId, finishReason: choice.finish_reason });
    }
  }

  if (chunk.usage) {
    events.push({
      type: 'usage',
      requestId,
      ...(chunk.usage.prompt_tokens === undefined ? {} : { inputTokens: chunk.usage.prompt_tokens }),
      ...(chunk.usage.completion_tokens === undefined ? {} : { outputTokens: chunk.usage.completion_tokens }),
      ...(chunk.usage.total_tokens === undefined ? {} : { totalTokens: chunk.usage.total_tokens }),
    });
  }
  return events;
}

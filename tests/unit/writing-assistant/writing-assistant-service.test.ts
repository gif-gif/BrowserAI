import { describe, expect, it, vi } from 'vitest';
import { WritingAssistantService } from '../../../core/writing-assistant/writing-assistant-service';
import type { ProviderAdapter, ProviderChatInput } from '../../../core/providers/provider-adapter';
import type { ProviderConfig } from '../../../shared/types/provider';

const config: ProviderConfig = {
  id: 'gateway-1',
  name: 'Gateway',
  type: 'openai-compatible',
  baseURL: 'https://gw.example.com/v1',
  model: 'model-1',
  endpointMode: 'chat-completions',
  defaultHeaders: {},
  timeoutMs: 30_000,
  stream: true,
  createdAt: 1,
  updatedAt: 1,
};

function adapter(onInput = vi.fn(), responses = ['润色后的文字']): ProviderAdapter {
  let callIndex = 0;
  return {
    type: 'openai-compatible',
    capabilities: { streaming: true, text: true, vision: false, files: false, tools: false },
    listModels: vi.fn(async () => []),
    testDraft: vi.fn(async () => ({ ok: true, message: 'ok' })),
    testConnection: vi.fn(async () => ({ ok: true, message: 'ok' })),
    async *streamChat(input: ProviderChatInput) {
      onInput(input);
      const response = responses[Math.min(callIndex, responses.length - 1)]!;
      callIndex += 1;
      yield { type: 'started' as const, requestId: input.requestId };
      yield { type: 'delta' as const, requestId: input.requestId, text: response };
      yield { type: 'completed' as const, requestId: input.requestId };
    },
  };
}

describe('WritingAssistantService', () => {
  it('rewrites text with the configured gateway without creating a conversation', async () => {
    const onInput = vi.fn();
    const provider = adapter(onInput);
    const service = new WritingAssistantService({
      listConfigs: vi.fn(async () => [config]),
      hasGatewayPermission: vi.fn(async () => true),
      getAdapter: vi.fn(() => provider),
    });

    await expect(service.rewrite({
      requestId: 'writing-1',
      text: '  这个文案需要修改。  ',
      instruction: '用于客户邮件',
      tone: 'professional',
      locale: 'zh-CN',
    })).resolves.toEqual({ text: '润色后的文字' });

    expect(onInput).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'writing-1',
      providerId: 'gateway-1',
      model: 'model-1',
      temperature: 0.4,
      messages: [
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('Never return the source verbatim'),
        }),
        expect.objectContaining({
          role: 'user',
          content: '这个文案需要修改。',
        }),
      ],
    }));
    expect(onInput.mock.calls[0]![0].messages[0].content).toContain('Additional rewrite requirement from the user: 用于客户邮件');
    expect(onInput.mock.calls[0]![0].messages[1].content).toBe('这个文案需要修改。');
    expect(onInput.mock.calls[0]![0].messages[1].content).not.toContain('sourceText');
    expect(onInput.mock.calls[0]![0].messages[1].content).not.toContain('{');
  });


  it('uses the model selected in the writing assistant', async () => {
    const onInput = vi.fn();
    const service = new WritingAssistantService({
      listConfigs: vi.fn(async () => [config]),
      hasGatewayPermission: vi.fn(async () => true),
      getAdapter: vi.fn(() => adapter(onInput)),
    });

    await service.rewrite({
      requestId: 'writing-selected-model',
      text: '请优化这句话。',
      model: 'model-2',
      tone: 'polish',
      locale: 'zh-CN',
    });

    expect(onInput).toHaveBeenCalledWith(expect.objectContaining({ model: 'model-2' }));
  });

  it('automatically retries once when the model returns the source text unchanged', async () => {
    const onInput = vi.fn();
    const provider = adapter(onInput, [
      '这个文案需要修改。',
      '这段文案还需要进一步优化。',
    ]);
    const service = new WritingAssistantService({
      listConfigs: vi.fn(async () => [config]),
      hasGatewayPermission: vi.fn(async () => true),
      getAdapter: vi.fn(() => provider),
    });

    await expect(service.rewrite({
      requestId: 'writing-retry',
      text: '  这个文案需要修改。  ',
      tone: 'polish',
      locale: 'zh-CN',
    })).resolves.toEqual({ text: '这段文案还需要进一步优化。' });

    expect(onInput).toHaveBeenCalledTimes(2);
    expect(onInput.mock.calls[1]![0]).toEqual(expect.objectContaining({
      temperature: 0.55,
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('The previous attempt was identical to the source'),
        }),
        expect.objectContaining({
          role: 'user',
          content: '这个文案需要修改。',
        }),
      ]),
    }));
  });

  it('does not silently show the original text when both rewrite attempts are unchanged', async () => {
    const onInput = vi.fn();
    const provider = adapter(onInput, ['Hello world', '  Hello   world  ']);
    const service = new WritingAssistantService({
      listConfigs: vi.fn(async () => [config]),
      hasGatewayPermission: vi.fn(async () => true),
      getAdapter: vi.fn(() => provider),
    });

    await expect(service.rewrite({
      requestId: 'writing-unchanged',
      text: 'Hello world',
      tone: 'polish',
      locale: 'en',
    })).rejects.toMatchObject({
      code: 'WRITING_ASSISTANT_UNCHANGED',
      message: expect.stringContaining('没有生成有实际变化'),
      retryable: true,
    });
    expect(onInput).toHaveBeenCalledTimes(2);
  });

  it('unwraps a JSON result instead of displaying the response envelope', async () => {
    const service = new WritingAssistantService({
      listConfigs: vi.fn(async () => [config]),
      hasGatewayPermission: vi.fn(async () => true),
      getAdapter: vi.fn(() => adapter(vi.fn(), ['{"result":"表达更加自然流畅。"}'])),
    });

    await expect(service.rewrite({
      requestId: 'writing-json-result',
      text: '表达自然。',
      tone: 'polish',
      locale: 'zh-CN',
    })).resolves.toEqual({ text: '表达更加自然流畅。' });
  });

  it('retries request-metadata JSON instead of displaying it as the rewrite', async () => {
    const onInput = vi.fn();
    const echoedRequest = '{"task":"Improve clarity, grammar, flow, and word choice while keeping the original tone.","outputUiLanguage":"Simplified Chinese","sourceText":"森林"}';
    const provider = adapter(onInput, [echoedRequest, '森林郁郁葱葱，层叠的枝叶在微风中轻轻摇曳。']);
    const service = new WritingAssistantService({
      listConfigs: vi.fn(async () => [config]),
      hasGatewayPermission: vi.fn(async () => true),
      getAdapter: vi.fn(() => provider),
    });

    await expect(service.rewrite({
      requestId: 'writing-metadata-echo',
      text: '森林',
      tone: 'polish',
      locale: 'zh-CN',
    })).resolves.toEqual({ text: '森林郁郁葱葱，层叠的枝叶在微风中轻轻摇曳。' });

    expect(onInput).toHaveBeenCalledTimes(2);
    for (const call of onInput.mock.calls) {
      expect(call[0].messages[1].content).toBe('森林');
      expect(call[0].messages[1].content).not.toContain('outputUiLanguage');
      expect(call[0].messages[1].content).not.toContain('sourceText');
    }
  });

  it('unwraps a JSON result inside a Markdown fence', async () => {
    const service = new WritingAssistantService({
      listConfigs: vi.fn(async () => [config]),
      hasGatewayPermission: vi.fn(async () => true),
      getAdapter: vi.fn(() => adapter(vi.fn(), ['```json\n{"text":"A clearer sentence."}\n```'])),
    });

    await expect(service.rewrite({
      requestId: 'writing-fenced-json',
      text: 'A sentence.',
      tone: 'polish',
      locale: 'en',
    })).resolves.toEqual({ text: 'A clearer sentence.' });
  });

  it('unwraps a rewritten JSON field instead of displaying the response envelope', async () => {
    const rewritten = '那片郁郁葱葱的森林，枝叶交错、浓荫蔽日，宛如一座浑然天成的绿色殿堂。';
    const service = new WritingAssistantService({
      listConfigs: vi.fn(async () => [config]),
      hasGatewayPermission: vi.fn(async () => true),
      getAdapter: vi.fn(() => adapter(vi.fn(), [`{"rewritten":"${rewritten}"}`])),
    });

    await expect(service.rewrite({
      requestId: 'writing-json-rewritten',
      text: '森林很茂密。',
      tone: 'polish',
      locale: 'zh-CN',
    })).resolves.toEqual({ text: rewritten });
  });

  it('keeps ordinary prose containing braces unchanged', async () => {
    const result = 'Use {name} when greeting the customer in the revised message.';
    const service = new WritingAssistantService({
      listConfigs: vi.fn(async () => [config]),
      hasGatewayPermission: vi.fn(async () => true),
      getAdapter: vi.fn(() => adapter(vi.fn(), [result])),
    });

    await expect(service.rewrite({
      requestId: 'writing-braces',
      text: 'Greet the customer using {name}.',
      tone: 'professional',
      locale: 'en',
    })).resolves.toEqual({ text: result });
  });

  it('retries a JSON-wrapped unchanged result and enforces a requested character count', async () => {
    const onInput = vi.fn();
    const expanded = '品质源于对每个细节的认真打磨，也来自对用户需求的深入理解。我们坚持用可靠的标准、真诚的态度和持续改进的行动，让每一次体验都更稳定、更舒适、更值得信赖，并在长期积累中创造真正持久的价值。';
    const provider = adapter(onInput, ['{"result":"品"}', expanded]);
    const service = new WritingAssistantService({
      listConfigs: vi.fn(async () => [config]),
      hasGatewayPermission: vi.fn(async () => true),
      getAdapter: vi.fn(() => provider),
    });

    await expect(service.rewrite({
      requestId: 'writing-expand-100',
      text: '品',
      instruction: '帮我润色为100字的。',
      tone: 'polish',
      locale: 'zh-CN',
    })).resolves.toEqual({ text: expanded });

    expect(onInput).toHaveBeenCalledTimes(2);
    const firstSystemPrompt = onInput.mock.calls[0]![0].messages[0].content;
    const retrySystemPrompt = onInput.mock.calls[1]![0].messages[0].content;
    expect(firstSystemPrompt).toContain('Target length: about 100 characters');
    expect(firstSystemPrompt).toContain('Additional rewrite requirement from the user: 帮我润色为100字的。');
    expect(onInput.mock.calls[0]![0].messages[1].content).toBe('品');
    expect(onInput.mock.calls[1]![0].messages[1].content).toBe('品');
    expect(retrySystemPrompt).toContain('The previous attempt was identical to the source');
    expect(retrySystemPrompt).toContain('previous attempt had 1 characters');
    expect(retrySystemPrompt).toContain('close to 100 characters');
  });

  it('returns the best changed expansion instead of failing when a one-character source misses the target length', async () => {
    const onInput = vi.fn();
    const fallback = '品质不仅体现在结果上，也藏在每一次认真选择、细致打磨和持续改进之中。';
    const provider = adapter(onInput, ['{"result":"品"}', fallback]);
    const service = new WritingAssistantService({
      listConfigs: vi.fn(async () => [config]),
      hasGatewayPermission: vi.fn(async () => true),
      getAdapter: vi.fn(() => provider),
    });

    await expect(service.rewrite({
      requestId: 'writing-short-expansion-fallback',
      text: '品',
      instruction: '帮我润色为100字的。',
      tone: 'polish',
      locale: 'zh-CN',
    })).resolves.toEqual({ text: fallback });

    expect(onInput).toHaveBeenCalledTimes(2);
  });

  it('retries when a changed result is still far shorter than the requested length', async () => {
    const onInput = vi.fn();
    const expanded = 'Clear writing begins with a focused idea and develops it with useful detail for every reader who needs context and direction. A thoughtful revision improves structure, removes ambiguity, connects each sentence naturally, and keeps the tone consistent from beginning to end for a result that feels complete, purposeful, and easy to understand.';
    const provider = adapter(onInput, ['A clearer idea.', expanded]);
    const service = new WritingAssistantService({
      listConfigs: vi.fn(async () => [config]),
      hasGatewayPermission: vi.fn(async () => true),
      getAdapter: vi.fn(() => provider),
    });

    await expect(service.rewrite({
      requestId: 'writing-expand-50-words',
      text: 'An idea.',
      instruction: 'Expand this to about 50 words.',
      tone: 'professional',
      locale: 'en',
    })).resolves.toEqual({ text: expanded });

    expect(onInput).toHaveBeenCalledTimes(2);
    expect(onInput.mock.calls[1]![0].messages[0].content).toContain('previous attempt had 3 words');
    expect(onInput.mock.calls[1]![0].messages[1].content).toBe('An idea.');
  });

  it('requires an authorized configured gateway', async () => {
    const service = new WritingAssistantService({
      listConfigs: vi.fn(async () => [config]),
      hasGatewayPermission: vi.fn(async () => false),
      getAdapter: vi.fn(() => adapter()),
    });

    await expect(service.rewrite({
      requestId: 'writing-2', text: 'Hello', tone: 'polish', locale: 'en',
    })).rejects.toMatchObject({ code: 'HOST_PERMISSION_REQUIRED' });
  });
});

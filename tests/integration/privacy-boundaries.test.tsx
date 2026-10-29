import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SafeMarkdown } from '../../components/chat/SafeMarkdown';
import { createBackgroundRouter } from '../../messaging/background-router';
import { contentCommandSchema, contentEventSchema, runtimeCommandSchema } from '../../messaging/contracts';
import { createMvpHarness } from '../setup/mvp-harness';

const config = {
  id: 'gateway-1', name: 'Gateway', type: 'openai-compatible' as const,
  baseURL: 'https://gateway.example.com/v1', model: 'gpt-test', endpointMode: 'chat-completions' as const,
  defaultHeaders: {}, timeoutMs: 1000, stream: true as const,
};

describe('MVP privacy boundaries', () => {
  it('does not expose a secret retrieval route to Content Scripts or echo rejected payloads', async () => {
    const attempted = { version: 1, requestId: 'steal-1', type: 'GET_PROVIDER_SECRET', providerId: 'gateway-1', apiKey: 'sk-do-not-echo' };
    expect(contentCommandSchema.safeParse(attempted).success).toBe(false);
    expect(contentEventSchema.safeParse(attempted).success).toBe(false);
    expect(runtimeCommandSchema.safeParse(attempted).success).toBe(false);

    const router = createBackgroundRouter({} as never);
    const response = await router(attempted);
    expect(JSON.stringify(response)).not.toContain('sk-do-not-echo');
    expect(response).toMatchObject({ ok: false, error: { code: 'INVALID_MESSAGE' } });
  });

  it('keeps API keys and raw page payloads out of logs and persisted conversations', async () => {
    const consoleSpies = ['debug', 'info', 'log', 'warn', 'error'].map((method) =>
      vi.spyOn(console, method as 'log').mockImplementation(() => undefined));
    const harness = createMvpHarness();
    await harness.configure(config, 'sk-private-value');
    const state = await harness.openTab(1, 'https://example.test/private', 'nav-private');
    await harness.ask({
      requestId: 'r1', tabId: 1, conversationId: state.conversation.id,
      text: '总结', includePage: true,
    });

    const logs = consoleSpies.flatMap((spy) => spy.mock.calls).flat().join(' ');
    expect(logs).not.toContain('sk-private-value');
    expect(logs).not.toContain('本地页面正文 tab-1');
    expect(JSON.stringify(await harness.conversations.get(state.conversation.id))).not.toContain('本地页面正文 tab-1');
    consoleSpies.forEach((spy) => spy.mockRestore());
  });

  it('renders model HTML and script as inert text without executable controls', () => {
    const marker = '__chromeAiPwned';
    render(<SafeMarkdown content={`<script>window.${marker}=true</script><button>伪造删除</button>\n\n安全回答`} />);
    expect(document.querySelector('script')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '伪造删除' })).not.toBeInTheDocument();
    expect((window as unknown as Record<string, unknown>)[marker]).toBeUndefined();
    expect(screen.getByText('安全回答')).toBeInTheDocument();
  });
});

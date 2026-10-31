import type { RuntimeCommand } from '../../messaging/contracts';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App, { type SidePanelDependencies } from '../../entrypoints/sidepanel/App';
import type { ChatStreamPort } from '../../entrypoints/sidepanel/hooks/useChatStream';
import { AppError } from '../../shared/errors/app-error';
import type { ProviderConfig } from '../../shared/types/provider';
import type { ScreenshotSelectionLabels } from '../../shared/types/screenshot';
import type { ActiveTabState } from '../../shared/types/tab-state';
import { zhCN } from '../../shared/i18n/zh-CN';

const isGreeting = (name: string) => zhCN.greetings.includes(name);

function event<T>() {
  const listeners = new Set<(value: T) => void>();
  return {
    addListener(listener: (value: T) => void) { listeners.add(listener); },
    removeListener(listener: (value: T) => void) { listeners.delete(listener); },
    emit(value: T) { for (const listener of listeners) listener(value); },
  };
}

function createPort(): ChatStreamPort & { emit(message: unknown): void } {
  const messages = event<unknown>();
  const disconnects = event<void>();
  return {
    postMessage: vi.fn(),
    onMessage: messages,
    onDisconnect: disconnects,
    disconnect: vi.fn(),
    emit: messages.emit,
  };
}

function activeState(messages: ActiveTabState['conversation']['messages'] = []): ActiveTabState {
  return {
    tabId: 7,
    url: 'https://example.com/article',
    navigationKey: 'nav-1',
    conversation: {
      id: 'conversation-1',
      title: '页面对话',
      messages,
      
      model: 'gpt-test',
      promptVersion: 'v1',
      pinned: false,
      createdAt: 1,
      updatedAt: 1,
    },
    context: {
      status: 'ready',
      snapshot: {
        snapshotId: 'snapshot-1',
        tabId: 7,
        title: '示例文章',
        url: 'https://example.com/article',
        selection: { text: '用户选中的段落' },
        document: { text: '页面正文', extractionMethod: 'readability' },
        metadata: {
          extractedAt: 1,
          originalCharacterCount: 100,
          submittedCharacterCount: 100,
          truncated: false,
          navigationKey: 'nav-1',
        },
      },
    },
  };
}

const providerConfig: ProviderConfig = {
  id: 'provider-1',
  name: 'Gateway',
  type: 'openai-compatible',
  baseURL: 'https://gw.example/v1',
  model: 'gpt-test',
  endpointMode: 'chat-completions',
  defaultHeaders: {},
  timeoutMs: 30_000,
  stream: true,
  createdAt: 1,
  updatedAt: 1,
};

function dependencies(options: {
  states?: ActiveTabState[];
  providerReady?: boolean;
  models?: string[];
  port?: ReturnType<typeof createPort>;
  openOptionsPage?: () => Promise<void>;
  extractError?: unknown;
  retryError?: unknown;
  openConversation?: Promise<ActiveTabState>;
  openConversationError?: unknown;
  captureVisibleTab?: (tabId: number) => Promise<string>;
  captureRegionScreenshot?: (
    tabId: number,
    labels: ScreenshotSelectionLabels,
  ) => Promise<string | undefined>;
  tabMention?: SidePanelDependencies['tabMention'];
  subscribeSelectionChanges?: SidePanelDependencies['subscribeSelectionChanges'];
} = {}): SidePanelDependencies {
  const states = options.states ?? [activeState()];
  let stateIndex = 0;
  return {
    runtime: {
      send: vi.fn(async (command) => {
        if (command.type === 'OPEN_CONVERSATION' && options.openConversationError) {
          throw options.openConversationError;
        }
        if (command.type === 'OPEN_CONVERSATION' && options.openConversation) {
          return options.openConversation;
        }
        if (
          command.type === 'GET_ACTIVE_TAB_STATE'
          || command.type === 'GET_TAB_STATE'
          || command.type === 'OPEN_CONVERSATION'
        ) {
          const value = states[Math.min(stateIndex, states.length - 1)]!;
          stateIndex += 1;
          return value;
        }
        if (command.type === 'ANALYZE_PAGE_TECH_STACK') {
          return {
            url: 'https://example.com/article', title: '示例文章',
            scripts: ['/_next/static/chunks/app.js'], stylesheets: [], metaNames: [], htmlAttributes: {},
            frameworkMarkers: ['nextjs'],
            technologies: [{ name: 'Next.js', category: 'framework', confidence: 'high', evidence: ['DOM contains #__next'] }],
            truncated: false, capturedAt: 1,
          };
        }
        if (command.type === 'EXTRACT_PAGE_CONTEXT') {
          if (options.extractError) throw options.extractError;
          const value = states[Math.min(stateIndex, states.length - 1)]!;
          stateIndex += 1;
          return value.context.status === 'ready' ? value.context.snapshot : undefined;
        }
        if (command.type === 'RETRY_PAGE_CONTEXT') {
          if (options.retryError) throw options.retryError;
          const value = states[Math.min(stateIndex, states.length - 1)]!;
          stateIndex += 1;
          return value;
        }
        if (command.type === 'GET_PROVIDER_SETTINGS') {
          return options.providerReady === false
            ? { providers: [] }
            : { providers: [{ config: providerConfig, hasApiKey: true }] };
        }
        if (command.type === 'LIST_PROVIDER_MODELS') {
          return { models: options.models ?? ['gpt-test', 'gpt-alt'] };
        }
        if (command.type === 'CREATE_CONVERSATION') return states.at(-1)!;
        if (command.type === 'SET_CONVERSATION_MODEL') {
          const current = states[Math.min(stateIndex, states.length - 1)] ?? states.at(-1)!;
          return {
            ...current,
            conversation: { ...current.conversation, model: command.model },
          } satisfies ActiveTabState;
        }
        if (command.type === 'ALLOW_PAGE_ACCESS_ONCE') return { allowed: true };
        if (command.type === 'EXTRACT_TAB_CONTEXT') {
          return { tabId: command.tabId, snapshotId: `snap-${command.tabId}`, title: `Tab ${command.tabId}`, url: `https://example.org/${command.tabId}`, truncated: false };
        }
        return undefined;
      }),
    },
    createChatPort: () => options.port ?? createPort(),
    createRequestId: () => 'request-1',
    openOptionsPage: options.openOptionsPage ?? vi.fn(async () => undefined),
    ...(options.captureVisibleTab ? { captureVisibleTab: options.captureVisibleTab } : {}),
    ...(options.captureRegionScreenshot ? { captureRegionScreenshot: options.captureRegionScreenshot } : {}),
    ...(options.tabMention ? { tabMention: options.tabMention } : {}),
    ...(options.subscribeSelectionChanges ? { subscribeSelectionChanges: options.subscribeSelectionChanges } : {}),
  };
}

describe('Side Panel chat flow', () => {

  it('uploads an image and includes it in START_CHAT and the optimistic user message', async () => {
    const user = userEvent.setup();
    const port = createPort();
    const deps = dependencies({ port });
    const { container } = render(<App dependencies={deps} />);
    await screen.findByRole('combobox', { name: '消息' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'diagram.png', { type: 'image/png' });

    await user.upload(input, file);
    expect(await screen.findByRole('img', { name: 'diagram.png' })).toBeInTheDocument();
    await user.type(screen.getByRole('combobox', { name: '消息' }), '分析这张图');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_CHAT',
      text: '分析这张图',
      attachments: [expect.objectContaining({
        name: 'diagram.png', mimeType: 'image/png', source: 'upload',
        dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      })],
    })));
    expect(await screen.findByRole('img', { name: 'diagram.png' })).toBeInTheDocument();
  });

  it('captures a user-selected region and attaches the cropped screenshot', async () => {
    const user = userEvent.setup();
    const captureVisibleTab = vi.fn(async () => 'data:image/jpeg;base64,Zmlyc3Q=');
    const captureRegionScreenshot = vi.fn(async () => 'data:image/png;base64,c2Vjb25k');
    render(<App dependencies={dependencies({ captureVisibleTab, captureRegionScreenshot })} />);

    await user.click(await screen.findByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('menuitem', { name: '从屏幕上选择' }));

    expect(captureRegionScreenshot).toHaveBeenCalledWith(7, expect.objectContaining({
      instruction: expect.any(String), cancelHint: expect.any(String),
    }));
    expect(captureVisibleTab).not.toHaveBeenCalled();
    expect(await screen.findByRole('img', { name: /screenshot-/ })).toHaveAttribute(
      'src', 'data:image/png;base64,c2Vjb25k',
    );
  });

  it('does not show an error when a free screenshot selection is cancelled', async () => {
    const user = userEvent.setup();
    const captureRegionScreenshot = vi.fn(async () => undefined);
    render(<App dependencies={dependencies({
      captureVisibleTab: vi.fn(async () => 'data:image/jpeg;base64,aGVsbG8='),
      captureRegionScreenshot,
    })} />);

    await user.click(await screen.findByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('menuitem', { name: '从屏幕上选择' }));

    await waitFor(() => expect(captureRegionScreenshot).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /screenshot-/ })).not.toBeInTheDocument();
  });

  it('loads selected text, creates an optimistic turn, and sends the chosen context', async () => {
    const user = userEvent.setup();
    const port = createPort();
    render(<App dependencies={dependencies({ port })} />);

    expect(await screen.findByText('选中文本')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '移除当前页上下文' }));
    await user.type(screen.getByRole('combobox', { name: '消息' }), '解释选区');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(screen.getByText('解释选区')).toBeInTheDocument();
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_CHAT',
      requestId: 'request-1',
      contextSelection: {
        includePage: false,
        includeSelection: true,
        snapshotId: 'snapshot-1',
      },
    }));

    act(() => port.emit({ version: 1, type: 'delta', requestId: 'request-1', text: '选区说明' }));
    expect(await screen.findByText('选区说明')).toBeInTheDocument();
  });

  it('adds text selected on the page to the composer and drops it when cleared', async () => {
    const user = userEvent.setup();
    const port = createPort();
    let emitSelection: ((tabId: number, text: string) => void) | undefined;
    const withoutSelection = activeState();
    if (withoutSelection.context.status === 'ready') delete withoutSelection.context.snapshot.selection;
    render(<App dependencies={dependencies({
      port,
      states: [withoutSelection],
      subscribeSelectionChanges: (listener) => { emitSelection = listener; return () => undefined; },
    })} />);

    await screen.findByRole('button', { name: '移除当前页上下文' });
    expect(screen.queryByText('选中文本')).not.toBeInTheDocument();

    act(() => emitSelection?.(99, '其他标签页的选区'));
    expect(screen.queryByText('选中文本')).not.toBeInTheDocument();

    act(() => emitSelection?.(7, '层 做什么 你在产品里的感受'));
    expect(screen.getByText('选中文本')).toBeInTheDocument();
    expect(screen.getByText('层 做什么 你在产品里的感受')).toBeInTheDocument();

    await user.type(screen.getByRole('combobox', { name: '消息' }), '解释一下');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_CHAT',
      contextSelection: expect.objectContaining({ includeSelection: true, snapshotId: 'snapshot-1' }),
    }));

    act(() => emitSelection?.(7, ''));
    expect(screen.queryByText('选中文本')).not.toBeInTheDocument();
  });

  it('includes the current page by default for a normal message', async () => {
    const user = userEvent.setup();
    const port = createPort();
    render(<App dependencies={dependencies({ port })} />);

    expect(await screen.findByText('正在分享“示例文章”标签页')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '移除当前页上下文' })).toBeInTheDocument();
    await user.type(screen.getByRole('combobox', { name: '消息' }), '概括一下');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_CHAT',
      contextSelection: {
        includePage: true,
        includeSelection: true,
        snapshotId: 'snapshot-1',
      },
    }));
  });

  it('enables page actions for one message and turns the mode off after sending', async () => {
    const user = userEvent.setup();
    const port = createPort();
    render(<App dependencies={dependencies({ port })} />);

    await user.click(await screen.findByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: '操作网页' }));
    expect(screen.getByRole('button', { name: '关闭网页操作' })).toBeInTheDocument();

    await user.type(screen.getByRole('combobox', { name: '消息' }), '点击搜索按钮');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_CHAT',
      allowPageActions: true,
      text: '点击搜索按钮',
      contextSelection: {
        includePage: false,
        includeSelection: true,
        snapshotId: 'snapshot-1',
      },
    }));
    expect(screen.queryByRole('button', { name: '关闭网页操作' })).not.toBeInTheDocument();
  });


  it('analyzes the page tech stack without extracting or attaching page body text', async () => {
    const user = userEvent.setup();
    const port = createPort();
    const deps = dependencies({ port });
    render(<App dependencies={deps} />);

    await user.click(await screen.findByRole('button', { name: '分析技术栈' }));

    await waitFor(() => expect(deps.runtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ANALYZE_PAGE_TECH_STACK',
      tabId: 7,
    })));
    expect(deps.runtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'EXTRACT_PAGE_CONTEXT' }));
    await waitFor(() => expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_CHAT',
      contextSelection: { includePage: false, includeSelection: false },
      techStackEvidence: expect.objectContaining({
        technologies: [expect.objectContaining({ name: 'Next.js', confidence: 'high' })],
      }),
    })));
  });

  it('runs a page quick action on the selected text only when the composer has a selection', async () => {
    const user = userEvent.setup();
    const port = createPort();
    render(<App dependencies={dependencies({ port })} />);

    await user.click(await screen.findByRole('button', { name: '翻译' }));

    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_CHAT',
      text: '将当前页面或选中的内容翻译成简体中文，并保留原有结构。',
      contextSelection: {
        includePage: false,
        includeSelection: true,
        snapshotId: 'snapshot-1',
      },
    }));
  });

  it('attaches the current page to a page quick action when nothing is selected', async () => {
    const user = userEvent.setup();
    const port = createPort();
    const withoutSelection = activeState();
    if (withoutSelection.context.status === 'ready') delete withoutSelection.context.snapshot.selection;
    render(<App dependencies={dependencies({ port, states: [withoutSelection] })} />);

    await user.click(await screen.findByRole('button', { name: '总结' }));

    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_CHAT',
      text: '总结当前页面，先给一句话结论，再列出关键要点。',
      contextSelection: {
        includePage: true,
        includeSelection: false,
        snapshotId: 'snapshot-1',
      },
    }));
  });

  it('extracts the original content tab before running a page quick action when context is unavailable', async () => {
    const user = userEvent.setup();
    const port = createPort();
    const unavailable: ActiveTabState = {
      ...activeState(),
      context: { status: 'unavailable', reason: 'CONTEXT_EXTRACTION_FAILED' },
    };
    const deps = dependencies({ port, states: [unavailable, activeState()] });
    render(<App dependencies={deps} />);

    await user.click(await screen.findByRole('button', { name: '总结' }));

    await waitFor(() => expect(deps.runtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'EXTRACT_PAGE_CONTEXT',
      tabId: 7,
    })));
    await waitFor(() => expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_CHAT',
      contextSelection: expect.objectContaining({
        includePage: true,
        snapshotId: 'snapshot-1',
      }),
    })));
  });

  it('does not send a page quick action without readable page text', async () => {
    const user = userEvent.setup();
    const port = createPort();
    const unavailable: ActiveTabState = {
      ...activeState(),
      context: { status: 'unavailable', reason: 'PAGE_UNSUPPORTED' },
    };
    const deps = dependencies({ port, states: [unavailable, unavailable] });
    render(<App dependencies={deps} />);

    await user.click(await screen.findByRole('button', { name: '总结' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取当前页面内容');
    expect(port.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'START_CHAT' }));
  });

  it('shows only the page-access message when page extraction returns a protocol error', async () => {
    const user = userEvent.setup();
    const port = createPort();
    const unavailable: ActiveTabState = {
      ...activeState(),
      context: { status: 'unavailable', reason: 'CONTEXT_EXTRACTION_FAILED' },
    };
    const deps = dependencies({
      port,
      states: [unavailable],
      extractError: new AppError('INVALID_MESSAGE', '消息格式无效'),
    });
    render(<App dependencies={deps} />);

    await user.click(await screen.findByRole('button', { name: '总结' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('无法读取当前页面内容');
    expect(screen.queryByText('消息格式无效')).not.toBeInTheDocument();
    expect(port.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'START_CHAT' }));
  });

  it('retries a failed page context and clears the stale page-read error', async () => {
    const user = userEvent.setup();
    const failed: ActiveTabState = {
      ...activeState(),
      context: { status: 'unavailable', reason: 'CONTEXT_EXTRACTION_FAILED' },
    };
    const deps = dependencies({
      states: [failed, activeState()],
      extractError: new AppError('CONTEXT_EXTRACTION_FAILED', '无法读取当前页面内容'),
    });
    render(<App dependencies={deps} />);

    await user.click(await screen.findByRole('button', { name: '总结' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取当前页面内容');

    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByRole('menuitem', { name: '重新读取当前页' }));
    expect(deps.runtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'RETRY_PAGE_CONTEXT',
      tabId: 7,
    }));
    expect(await screen.findByText('正在分享“示例文章”标签页')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('无法读取当前页面内容。请打开普通网页或允许页面访问后重试。')).not.toBeInTheDocument());
  });

  it('falls back to the legacy extraction command when an old background rejects retry', async () => {
    const user = userEvent.setup();
    const failed: ActiveTabState = {
      ...activeState(),
      context: { status: 'unavailable', reason: 'CONTEXT_EXTRACTION_FAILED' },
    };
    const deps = dependencies({
      states: [failed, activeState()],
      retryError: new AppError('INVALID_MESSAGE', '消息格式无效'),
    });
    render(<App dependencies={deps} />);

    await user.click(await screen.findByRole('button', { name: '更多操作' }));
    await user.click(await screen.findByRole('menuitem', { name: '重新读取当前页' }));

    expect(deps.runtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'RETRY_PAGE_CONTEXT',
      tabId: 7,
    }));
    expect(deps.runtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'EXTRACT_PAGE_CONTEXT',
      tabId: 7,
    }));
    expect(await screen.findByText('正在分享“示例文章”标签页')).toBeInTheDocument();
    expect(screen.queryByText('消息格式无效')).not.toBeInTheDocument();
  });

  it('opens the settings page at the model section from the quick setup card', async () => {
    const user = userEvent.setup();
    const openOptionsPage = vi.fn(async () => undefined);
    render(<App dependencies={dependencies({ providerReady: false, openOptionsPage })} />);
    expect(await screen.findByRole('form', { name: '连接 AI Gateway' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '更多设置' }));
    expect(openOptionsPage).toHaveBeenCalledWith('models');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('connects a Gateway in one step from the quick setup card and preselects a text model', async () => {
    const user = userEvent.setup();
    const deps = dependencies({ providerReady: false, models: ['text-embedding-3-small', 'llama-3', 'claude-sonnet-4', 'gpt-4o'] });
    const requestGatewayAccess = vi.fn(async () => true);
    deps.requestGatewayAccess = requestGatewayAccess;
    const send = vi.mocked(deps.runtime.send);
    const fallback = send.getMockImplementation()!;
    let saved = false;
    send.mockImplementation(async (command: RuntimeCommand) => {
      if (command.type === 'SAVE_PROVIDER_CONFIG') { saved = true; return { config: command.config, hasApiKey: true }; }
      if (command.type === 'GET_PROVIDER_SETTINGS' && saved) return { providers: [{ config: providerConfig, hasApiKey: true }] };
      return fallback(command);
    });
    render(<App dependencies={deps} />);

    await screen.findByRole('form', { name: '连接 AI Gateway' });
    await user.click(screen.getByRole('combobox', { name: '接口格式' }));
    await user.click(screen.getByRole('option', { name: 'Anthropic Messages' }));
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://api.anthropic.com');
    await user.clear(screen.getByLabelText('Base URL'));
    await user.type(screen.getByLabelText('Base URL'), 'https://gateway.example.com');
    await user.type(screen.getByLabelText('API Key'), 'test-key');
    await user.click(screen.getByRole('button', { name: '一键连接' }));

    expect(requestGatewayAccess).toHaveBeenCalledWith('https://gateway.example.com');
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SAVE_PROVIDER_CONFIG',
      apiKey: 'test-key',
      config: expect.objectContaining({
        type: 'anthropic-messages',
        endpointMode: 'messages',
        baseURL: 'https://gateway.example.com',
        name: 'gateway.example.com',
        model: 'claude-sonnet-4',
      }),
    })));
    await waitFor(() => expect(screen.queryByRole('form', { name: '连接 AI Gateway' })).not.toBeInTheDocument());
  });

  it('asks for all-sites access from the send gesture, not before', async () => {
    const user = userEvent.setup();
    const deps = dependencies();
    deps.ensureAllSitesAccess = vi.fn();
    render(<App dependencies={deps} />);

    const input = await screen.findByRole('combobox', { name: '消息' });
    expect(deps.ensureAllSitesAccess).not.toHaveBeenCalled();
    await user.type(input, 'Hello{Enter}');
    expect(deps.ensureAllSitesAccess).toHaveBeenCalledTimes(1);
  });

  it('keeps the quick setup card with an error when Gateway access is denied', async () => {
    const user = userEvent.setup();
    const deps = dependencies({ providerReady: false });
    deps.requestGatewayAccess = vi.fn(async () => false);
    render(<App dependencies={deps} />);

    await screen.findByRole('form', { name: '连接 AI Gateway' });
    await user.click(screen.getByRole('button', { name: '一键连接' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请填写 API Key');
    await user.type(screen.getByLabelText('API Key'), 'test-key');
    await user.click(screen.getByRole('button', { name: '一键连接' }));
    expect(await screen.findByText(/需要授权/)).toBeInTheDocument();
    expect(deps.runtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SAVE_PROVIDER_CONFIG' }));
  });

  it('moves the chat into the page from the side panel menu', async () => {
    const user = userEvent.setup();
    const deps = dependencies();
    deps.openFloatingChat = vi.fn(async () => undefined);
    render(<App dependencies={deps} />);

    await screen.findByRole('combobox', { name: '消息' });
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByRole('menuitem', { name: '浮动显示' }));
    expect(deps.openFloatingChat).toHaveBeenCalledWith({ tabId: 7, url: 'https://example.com/article' });
  });

  it('shows a localized error when the page cannot host the floating chat', async () => {
    const user = userEvent.setup();
    const deps = dependencies();
    deps.openFloatingChat = vi.fn(async () => { throw new AppError('PAGE_UNSUPPORTED', '当前页面不支持浮动显示'); });
    render(<App dependencies={deps} />);

    await screen.findByRole('combobox', { name: '消息' });
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByRole('menuitem', { name: '浮动显示' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('当前页面不支持浮动显示');
  });

  it('runs as the floating chat of one tab and can hand over to the side panel', async () => {
    const user = userEvent.setup();
    const deps = dependencies();
    deps.floatingTabId = 7;
    deps.openSidePanel = vi.fn(async () => undefined);
    render(<App dependencies={deps} />);

    await screen.findByRole('combobox', { name: '消息' });
    expect(deps.runtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'GET_TAB_STATE', tabId: 7 }));
    expect(deps.runtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'GET_ACTIVE_TAB_STATE' }));
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByRole('menuitem', { name: '在侧边栏中打开' }));
    expect(deps.openSidePanel).toHaveBeenCalledWith(7);
  });

  it('explains how to grant Gateway access when the floating chat cannot prompt', async () => {
    const user = userEvent.setup();
    const deps = dependencies({ providerReady: false });
    deps.floatingTabId = 7;
    deps.requestGatewayAccess = vi.fn(async () => { throw new Error('This function must be called during a user gesture'); });
    render(<App dependencies={deps} />);

    await screen.findByRole('form', { name: '连接 AI Gateway' });
    await user.type(screen.getByLabelText('API Key'), 'test-key');
    await user.click(screen.getByRole('button', { name: '一键连接' }));
    expect(await screen.findByText(zhCN.quickSetupFloatingPermission)).toBeInTheDocument();
    expect(deps.runtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'LIST_PROVIDER_MODELS' }));
  });

  it('opens the settings page from the header settings button instead of a drawer', async () => {
    const user = userEvent.setup();
    const openOptionsPage = vi.fn(async () => undefined);
    render(<App dependencies={dependencies({ openOptionsPage })} />);
    await screen.findByRole('combobox', { name: '消息' });
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByRole('menuitem', { name: '设置' }));
    expect(openOptionsPage).toHaveBeenCalledTimes(1);
    expect(openOptionsPage).toHaveBeenCalledWith(undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains an excluded site and allows one-time page access only after confirmation', async () => {
    const user = userEvent.setup();
    const excluded = {
      ...activeState(),
      context: {
        status: 'unavailable' as const,
        reason: 'PAGE_PERMISSION_REQUIRED' as const,
        message: '此网站已在自动访问中排除。',
        canAllowOnce: true,
      },
    };
    const ready = activeState();
    const deps = dependencies({ states: [excluded, ready] });
    render(<App dependencies={deps} />);

    expect(await screen.findByRole('status')).toHaveTextContent('此网站已在自动访问中排除');
    await user.click(screen.getByRole('button', { name: '允许本次读取' }));
    expect(deps.runtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ALLOW_PAGE_ACCESS_ONCE',
      tabId: 7,
    }));
    expect(await screen.findByText('正在分享“示例文章”标签页')).toBeInTheDocument();
  });

  it('reconciles terminal stream state from the persisted conversation', async () => {
    const user = userEvent.setup();
    const port = createPort();
    const persisted = activeState([
      { id: 'user-1', role: 'user', content: '你好', status: 'complete', createdAt: 2 },
      { id: 'assistant-1', role: 'assistant', content: '持久化答案', status: 'complete', createdAt: 3 },
    ]);
    const deps = dependencies({ port, states: [activeState(), persisted] });
    render(<App dependencies={deps} />);
    await screen.findByRole('combobox', { name: '消息' });
    await user.type(screen.getByRole('combobox', { name: '消息' }), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));
    act(() => {
      port.emit({ version: 1, type: 'delta', requestId: 'request-1', text: '临时答案' });
      port.emit({ version: 1, type: 'completed', requestId: 'request-1' });
    });

    expect(await screen.findByText('持久化答案')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('临时答案')).not.toBeInTheDocument());
    expect(deps.runtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'OPEN_CONVERSATION',
      tabId: 7,
      conversationId: 'conversation-1',
    }));
    expect(deps.runtime.send).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'GET_TAB_STATE',
    }));
  });

  it('keeps the optimistic conversation visible until persisted reconciliation finishes', async () => {
    const user = userEvent.setup();
    const port = createPort();
    let resolveRefresh: ((state: ActiveTabState) => void) | undefined;
    const refresh = new Promise<ActiveTabState>((resolve) => { resolveRefresh = resolve; });
    const persisted = activeState([
      { id: 'user-1', role: 'user', content: '不要闪退', status: 'complete', createdAt: 2 },
      { id: 'assistant-1', role: 'assistant', content: '持久化后的回答', status: 'complete', createdAt: 3 },
    ]);
    const deps = dependencies({ port, states: [activeState()], openConversation: refresh });
    render(<App dependencies={deps} />);

    await user.type(await screen.findByRole('combobox', { name: '消息' }), '不要闪退');
    await user.click(screen.getByRole('button', { name: '发送' }));
    act(() => {
      port.emit({ version: 1, type: 'delta', requestId: 'request-1', text: '仍在界面上的回答' });
      port.emit({ version: 1, type: 'completed', requestId: 'request-1' });
    });

    await waitFor(() => expect(deps.runtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'OPEN_CONVERSATION',
    })));
    expect(screen.getByText('不要闪退')).toBeInTheDocument();
    expect(screen.getByText('仍在界面上的回答')).toBeInTheDocument();
    expect(document.querySelector('.empty-state')).not.toBeInTheDocument();

    await act(async () => { resolveRefresh?.(persisted); });
    expect(await screen.findByText('持久化后的回答')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('仍在界面上的回答')).not.toBeInTheDocument());
  });

  it('does not return to the default page when persisted reconciliation fails', async () => {
    const user = userEvent.setup();
    const port = createPort();
    const deps = dependencies({
      port,
      states: [activeState()],
      openConversationError: new AppError('UNKNOWN', '暂时无法刷新会话'),
    });
    render(<App dependencies={deps} />);

    await user.type(await screen.findByRole('combobox', { name: '消息' }), '保留这条消息');
    await user.click(screen.getByRole('button', { name: '发送' }));
    act(() => {
      port.emit({ version: 1, type: 'delta', requestId: 'request-1', text: '保留这段回答' });
      port.emit({ version: 1, type: 'completed', requestId: 'request-1' });
    });

    await waitFor(() => expect(deps.runtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'OPEN_CONVERSATION',
    })));
    expect(await screen.findByText('保留这条消息')).toBeInTheDocument();
    expect(screen.getByText('保留这段回答')).toBeInTheDocument();
    expect(document.querySelector('.empty-state')).not.toBeInTheDocument();
  });

  it('switches immediately to the state returned when creating a new conversation', async () => {
    const user = userEvent.setup();
    const oldState = activeState([
      { id: 'user-old', role: 'user', content: '旧对话内容', status: 'complete', createdAt: 2 },
    ]);
    const newState: ActiveTabState = {
      ...oldState,
      conversation: {
        ...oldState.conversation,
        id: 'conversation-2',
        title: '新对话',
        messages: [],
        createdAt: 3,
        updatedAt: 3,
      },
    };
    const deps = dependencies({ states: [oldState, newState] });
    render(<App dependencies={deps} />);

    expect(await screen.findByText('旧对话内容')).toBeInTheDocument();
    const activeStateCallsBeforeCreate = vi.mocked(deps.runtime.send).mock.calls
      .filter(([command]) => command.type === 'GET_ACTIVE_TAB_STATE').length;

    await user.click(screen.getByRole('button', { name: '新对话' }));

    expect(deps.runtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CREATE_CONVERSATION',
      tabId: 7,
    }));
    expect(await screen.findByRole('heading', { name: isGreeting })).toBeInTheDocument();
    expect(screen.queryByText('旧对话内容')).not.toBeInTheDocument();
    expect(vi.mocked(deps.runtime.send).mock.calls
      .filter(([command]) => command.type === 'GET_ACTIVE_TAB_STATE')).toHaveLength(activeStateCallsBeforeCreate);
  });

  it('shows one of the localized greetings at random on a new conversation', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      render(<App dependencies={dependencies({ states: [activeState()] })} />);
      expect(await screen.findByRole('heading', { name: zhCN.greetings.at(-1) })).toBeInTheDocument();
    } finally {
      random.mockRestore();
    }
  });

  it('changes the active conversation model from the composer selector', async () => {
    const user = userEvent.setup();
    const deps = dependencies({ models: ['gpt-test', 'gpt-alt'] });
    render(<App dependencies={deps} />);

    const selector = await screen.findByRole('button', { name: /^模型:/ });
    await waitFor(() => expect(selector).toBeEnabled());
    await user.click(selector);
    await user.click(await screen.findByRole('option', { name: 'gpt-alt' }));

    expect(deps.runtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SET_CONVERSATION_MODEL',
      tabId: 7,
      conversationId: 'conversation-1',
      model: 'gpt-alt',
    }));
    await waitFor(() => expect(screen.getByRole('button', { name: '模型: gpt-alt' })).toBeInTheDocument());
  });

  it('keeps the removed page context unselected after switching the model', async () => {
    const user = userEvent.setup();
    const port = createPort();
    render(<App dependencies={dependencies({ port, models: ['gpt-test', 'gpt-alt'] })} />);

    await user.click(await screen.findByRole('button', { name: '移除当前页上下文' }));
    const selector = screen.getByRole('button', { name: /^模型:/ });
    await waitFor(() => expect(selector).toBeEnabled());
    await user.click(selector);
    await user.click(await screen.findByRole('option', { name: 'gpt-alt' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '模型: gpt-alt' })).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: '移除当前页上下文' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('combobox', { name: '消息' }), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_CHAT',
      contextSelection: expect.objectContaining({ includePage: false }),
    }));
  });

  it('does not add a removed page context back when the page snapshot refreshes', async () => {
    const user = userEvent.setup();
    const port = createPort();
    const refreshed = activeState([
      { id: 'user-1', role: 'user', content: '你好', status: 'complete', createdAt: 2 },
      { id: 'assistant-1', role: 'assistant', content: '持久化答案', status: 'complete', createdAt: 3 },
    ]);
    if (refreshed.context.status === 'ready') refreshed.context.snapshot.snapshotId = 'snapshot-2';
    render(<App dependencies={dependencies({ port, states: [activeState(), refreshed] })} />);

    await user.click(await screen.findByRole('button', { name: '移除当前页上下文' }));
    await user.type(screen.getByRole('combobox', { name: '消息' }), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));
    act(() => port.emit({ version: 1, type: 'completed', requestId: 'request-1' }));
    expect(await screen.findByText('持久化答案')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: '移除当前页上下文' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '分享当前页' }));
    expect(screen.getByRole('button', { name: '移除当前页上下文' })).toBeInTheDocument();
  });

  it('shares extra tabs with “@”, keeps them after sending, and lets the user remove one', async () => {
    const user = userEvent.setup();
    const port = createPort();
    const requestSiteAccess = vi.fn(async () => true);
    render(<App dependencies={dependencies({
      port,
      tabMention: {
        listTabs: vi.fn(async () => [
          { tabId: 7, title: '示例文章', url: 'https://example.com/article', active: true, supported: true },
          { tabId: 8, title: 'GitHub', url: 'https://github.com/', active: false, supported: true },
          { tabId: 9, title: 'Docs', url: 'https://docs.example.com/', active: false, supported: true },
        ]),
        requestSiteAccess,
      },
    })} />);

    const textbox = await screen.findByRole('combobox', { name: '消息' });
    await user.type(textbox, '@git');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('menuitem', { name: '添加更多标签页' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /Docs/ }));
    await user.keyboard('{Escape}');

    expect(requestSiteAccess).toHaveBeenCalledWith('https://github.com/');
    expect(await screen.findByText('正在分享 3 个标签页')).toBeInTheDocument();

    await user.type(textbox, '对比这几个页面');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_CHAT',
      contextSelection: expect.objectContaining({ includePage: true, additionalTabIds: [8, 9] }),
    }));

    // Mentioned tabs stay attached until removed manually.
    await user.click(screen.getByRole('button', { name: '展开已分享的标签页' }));
    await user.click(await screen.findByRole('button', { name: '移除标签页上下文：Tab 8' }));
    expect(screen.getByText('正在分享 2 个标签页')).toBeInTheDocument();
  });
});

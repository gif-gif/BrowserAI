import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../entrypoints/options/App';
import { ProviderConfigService } from '../../core/settings/provider-config-service';
import type { RuntimeCommand } from '../../messaging/contracts';

function runtime() {
  const commands: RuntimeCommand[] = [];
  return {
    commands,
    client: {
      send: vi.fn(async (command: RuntimeCommand) => {
        commands.push(command);
        switch (command.type) {
          case 'GET_PROVIDER_SETTINGS': return { providers: [] };
          case 'LIST_PROVIDER_MODELS': return { models: ['gpt-4.1-mini', 'gpt-5-mini'] };
          case 'TEST_PROVIDER_DRAFT': return { ok: true, latencyMs: 42, message: '连接成功' };
          case 'SAVE_PROVIDER_CONFIG': return { config: { ...command.config, createdAt: 1, updatedAt: 1 }, hasApiKey: Boolean(command.apiKey) };
          default: return {};
        }
      }),
    },
  };
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>, withModel = true) {
  await user.type(screen.getByLabelText('名称'), 'Gateway');
  if (withModel) await user.type(screen.getByLabelText('模型'), 'gpt-test');
  await user.type(screen.getByLabelText('API Key'), 'sk-test');
}

describe('Options settings layout', () => {
  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('shows 通用、模型、技能 in the left menu and switches sections', async () => {
    const fake = runtime();
    render(<App service={new ProviderConfigService(fake.client)} runtime={fake.client} gatewayPermissions={{ request: vi.fn(async () => true) }} />);
    const user = userEvent.setup();
    const nav = screen.getByRole('navigation', { name: '设置菜单' });
    expect(within(nav).getAllByRole('button').map((item) => item.textContent)).toEqual(['通用', '模型', '技能']);
    expect(within(nav).getByRole('heading', { level: 1 })).toHaveTextContent('Browser AI设置');
    expect(within(nav).getByRole('button', { name: '通用' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: '显示语言' })).toBeInTheDocument();
    expect(screen.queryByText('OpenAI 兼容')).not.toBeInTheDocument();

    await user.click(within(nav).getByRole('button', { name: '模型' }));
    expect(await screen.findByText('OpenAI 兼容')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '显示语言' })).not.toBeInTheDocument();
    expect(window.location.hash).toBe('#models');

    await user.click(within(nav).getByRole('button', { name: '技能' }));
    expect(within(nav).getAllByRole('button').map((item) => item.textContent)).toEqual(['通用', '模型', '技能']);
    const skillsMenu = screen.getByRole('list', { name: '技能菜单' });
    expect(nav).not.toContainElement(skillsMenu);
    expect(within(skillsMenu).getAllByRole('button').map((item) => item.textContent)).toEqual(['浏览技能', '您的技能']);
    expect(within(skillsMenu).getByRole('button', { name: '浏览技能' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: '精选技能' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: '搜索技能' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#skills');

    await user.click(within(skillsMenu).getByRole('button', { name: '您的技能' }));
    expect(screen.getByRole('heading', { name: '您的技能' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '精选技能' })).not.toBeInTheDocument();
    expect(window.location.hash).toBe('#your-skills');
  });

  it('opens the section named in the URL hash', () => {
    window.history.replaceState(null, '', '#your-skills');
    const fake = runtime();
    render(<App service={new ProviderConfigService(fake.client)} gatewayPermissions={{ request: vi.fn(async () => true) }} />);
    expect(screen.getByRole('button', { name: '技能' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '您的技能' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: '您的技能' })).toBeInTheDocument();
  });
});

describe('Options Gateway actions', () => {
  beforeEach(() => { window.history.replaceState(null, '', '#models'); });
  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('shows only the model connection settings without the removed branded headers', async () => {
    const fake = runtime();
    render(<App service={new ProviderConfigService(fake.client)} gatewayPermissions={{ request: vi.fn(async () => true) }} />);

    expect(await screen.findByText('模型连接')).toBeInTheDocument();
    expect(screen.queryByText('连接你的模型，继续留在 Chrome')).not.toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByText('Browser AI')).not.toBeInTheDocument();
    expect(screen.queryByText('Gateway 设置')).not.toBeInTheDocument();
  });

  it('requests the exact Gateway origin in the pull-model user gesture before contacting Background', async () => {
    const fake = runtime();
    const request = vi.fn(async () => true);
    render(<App service={new ProviderConfigService(fake.client)} gatewayPermissions={{ request }} />);
    const user = userEvent.setup();
    await screen.findByText('OpenAI 兼容');
    await fillCredentials(user, false);
    await user.click(screen.getByRole('button', { name: '拉取模型' }));
    await screen.findByText('已拉取 2 个模型，请从候选列表选择或继续手动输入。');

    expect(request).toHaveBeenCalledWith({ permissions: ['tabs'], origins: ['https://api.openai.com/*', 'http://*/*', 'https://*/*'] });
    expect(request.mock.invocationCallOrder[0]!).toBeLessThan(fake.client.send.mock.invocationCallOrder[1]!);
    expect(fake.commands.map((command) => command.type)).toEqual(['GET_PROVIDER_SETTINGS', 'LIST_PROVIDER_MODELS']);
  });

  it('tests the current draft independently without saving it', async () => {
    const fake = runtime();
    const request = vi.fn(async () => true);
    render(<App service={new ProviderConfigService(fake.client)} gatewayPermissions={{ request }} />);
    const user = userEvent.setup();
    await screen.findByText('OpenAI 兼容');
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: '测试网关' }));
    await screen.findByText('连接成功 · 42 ms');

    expect(request).toHaveBeenCalledWith({ permissions: ['tabs'], origins: ['https://api.openai.com/*', 'http://*/*', 'https://*/*'] });
    expect(request.mock.invocationCallOrder[0]!).toBeLessThan(fake.client.send.mock.invocationCallOrder[1]!);
    expect(fake.commands.map((command) => command.type)).toEqual(['GET_PROVIDER_SETTINGS', 'TEST_PROVIDER_DRAFT']);
  });

  it('saves separately and does not perform an implicit connection test', async () => {
    const fake = runtime();
    const request = vi.fn(async () => true);
    render(<App service={new ProviderConfigService(fake.client)} gatewayPermissions={{ request }} />);
    const user = userEvent.setup();
    await screen.findByText('OpenAI 兼容');
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    const status = await screen.findByText('Gateway 配置已保存。');
    // The result sits inside the form right above the actions, and the button briefly confirms the save.
    expect(status.closest('form')).not.toBeNull();
    expect(status.nextElementSibling).toHaveClass('form-actions');
    expect(screen.getByRole('button', { name: '已保存' })).toHaveClass('primary-button--saved');

    expect(request).toHaveBeenCalledWith({ permissions: ['tabs'], origins: ['https://api.openai.com/*', 'http://*/*', 'https://*/*'] });
    expect(request.mock.invocationCallOrder[0]!).toBeLessThan(fake.client.send.mock.invocationCallOrder[1]!);
    expect(fake.commands.map((command) => command.type)).toEqual(['GET_PROVIDER_SETTINGS', 'SAVE_PROVIDER_CONFIG']);
  });

  it('does not contact Background when the user denies Gateway access', async () => {
    const fake = runtime();
    const request = vi.fn(async () => false);
    render(<App service={new ProviderConfigService(fake.client)} gatewayPermissions={{ request }} />);
    const user = userEvent.setup();
    await screen.findByText('OpenAI 兼容');
    await fillCredentials(user, false);
    await user.click(screen.getByRole('button', { name: '拉取模型' }));
    expect(await screen.findByText(/需要授权：请允许 Chrome/)).toBeInTheDocument();
    await waitFor(() => expect(fake.commands.map((command) => command.type)).toEqual(['GET_PROVIDER_SETTINGS']));
  });
});

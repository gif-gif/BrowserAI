import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GatewayForm } from '../../../../components/settings/GatewayForm';
import type { ProviderConfigDraft, ProviderConfigSubmission } from '../../../../shared/types/provider';

const configured: ProviderConfigDraft = {
  id: 'gateway-main',
  name: '团队 Gateway',
  type: 'openai-compatible',
  baseURL: 'https://gateway.example.com/v1',
  model: 'gpt-5-mini',
  endpointMode: 'chat-completions',
  defaultHeaders: { 'X-Team': 'alpha' },
  timeoutMs: 30_000,
  stream: true,
};

function renderForm(overrides: Partial<React.ComponentProps<typeof GatewayForm>> = {}) {
  return render(<GatewayForm
    onSubmit={vi.fn()}
    onRemoveSecret={vi.fn()}
    onListModels={vi.fn(async () => [])}
    onTest={vi.fn(async () => ({ ok: true, message: '连接成功', latencyMs: 42 }))}
    {...overrides}
  />);
}

describe('GatewayForm', () => {
  it('starts with an empty name and the OpenAI Base URL for a new configuration', () => {
    renderForm();
    expect(screen.getByLabelText('名称')).toHaveValue('');
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://api.openai.com/v1');
  });

  it('shows an existing key as configured without rendering plaintext', () => {
    const { container } = renderForm({ initialConfig: configured, hasApiKey: true });
    expect(screen.getByText('已配置')).toBeInTheDocument();
    expect(container.textContent).not.toContain('super-secret');
    expect(screen.getByLabelText('API Key')).toHaveValue('');
  });

  it('shows inline errors for invalid URLs and blocked custom headers', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.clear(screen.getByLabelText('名称'));
    await user.type(screen.getByLabelText('名称'), 'Gateway');
    await user.clear(screen.getByLabelText('Base URL'));
    await user.type(screen.getByLabelText('Base URL'), 'not-a-url');
    await user.type(screen.getByLabelText('模型'), 'gpt-test');
    fireEvent.change(screen.getByLabelText('自定义请求头（JSON）'), { target: { value: '{"Authorization":"Bearer unsafe"}' } });
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    expect(screen.getByText('请输入有效的 HTTP 或 HTTPS URL')).toBeInTheDocument();
    expect(screen.getByText('不允许覆盖请求头：Authorization')).toBeInTheDocument();
  });

  it('pulls model suggestions into the model field while keeping it editable', async () => {
    const user = userEvent.setup();
    const onListModels = vi.fn(async () => ['gpt-4.1-mini', 'gpt-5-mini']);
    renderForm({ onListModels });
    await user.type(screen.getByLabelText('API Key'), 'sk-test');
    expect(screen.queryByRole('button', { name: '从已拉取模型中选择' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '模型' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '拉取模型' }));
    expect(onListModels).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({ baseURL: 'https://api.openai.com/v1', model: '' }),
      apiKey: 'sk-test',
    }));
    expect(screen.getByText('已拉取 2 个模型，请从候选列表选择或继续手动输入。')).toBeInTheDocument();

    const modelInput = screen.getByRole('textbox', { name: '模型' });
    const toggle = screen.getByRole('button', { name: '从已拉取模型中选择' });
    await user.click(toggle);
    const search = screen.getByRole('combobox', { name: '搜索模型' });
    expect(search).toHaveFocus();
    expect(screen.getByRole('option', { name: 'gpt-4.1-mini' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'gpt-5-mini' }));
    expect(modelInput).toHaveValue('gpt-5-mini');
    expect(modelInput).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole('option', { name: 'gpt-5-mini' })).toHaveAttribute('aria-selected', 'true');
    await user.type(screen.getByRole('combobox', { name: '搜索模型' }), '4.1');
    expect(screen.getByRole('option', { name: 'gpt-4.1-mini' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'gpt-5-mini' })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(modelInput).toHaveValue('gpt-4.1-mini');

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(modelInput).toHaveValue('gpt-5-mini');

    await user.click(toggle);
    await user.type(screen.getByRole('combobox', { name: '搜索模型' }), 'nothing');
    expect(screen.getByText('没有匹配的模型')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(modelInput).toHaveValue('gpt-5-mini');

    await user.click(toggle);
    await user.click(screen.getByText('已拉取 2 个模型，请从候选列表选择或继续手动输入。'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.clear(modelInput);
    await user.type(modelInput, 'my-custom-model');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(modelInput).toHaveValue('my-custom-model');
  });

  it('requires a model before testing and renders a successful test result', async () => {
    const user = userEvent.setup();
    const onTest = vi.fn(async () => ({ ok: true, message: '连接成功', latencyMs: 42 }));
    renderForm({ onTest });
    await user.click(screen.getByRole('button', { name: '测试网关' }));
    expect(screen.getByText('请先选择或输入模型名称')).toBeInTheDocument();
    expect(onTest).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('模型'), 'gpt-test');
    await user.click(screen.getByRole('button', { name: '测试网关' }));
    expect(onTest).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('连接成功 · 42 ms')).toBeInTheDocument();
  });

  it('preserves an existing key by omitting an empty API key submission', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(submission: ProviderConfigSubmission) => Promise<void>>(async () => undefined);
    renderForm({ initialConfig: configured, hasApiKey: true, onSubmit });
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('apiKey');
  });

  it('requires confirmation before removing a stored key', async () => {
    const user = userEvent.setup();
    const onRemoveSecret = vi.fn(async () => undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderForm({ initialConfig: configured, hasApiKey: true, onRemoveSecret });
    await user.click(screen.getByRole('button', { name: '移除密钥' }));
    expect(onRemoveSecret).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '移除密钥' }));
    expect(onRemoveSecret).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it('shows a visible HTTP warning and requires acknowledgement', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(submission: ProviderConfigSubmission) => Promise<void>>(async () => undefined);
    renderForm({ onSubmit });
    await user.clear(screen.getByLabelText('名称'));
    await user.type(screen.getByLabelText('名称'), 'Local Gateway');
    await user.clear(screen.getByLabelText('Base URL'));
    await user.type(screen.getByLabelText('Base URL'), 'http://localhost:8787/v1');
    await user.type(screen.getByLabelText('模型'), 'local-model');
    expect(await screen.findByText(/HTTP 连接未加密/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    expect(screen.getByText('请确认你了解 HTTP 连接风险')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText('我了解并接受 HTTP 连接风险'));
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ acknowledgeInsecureTransport: true }));
  });

  it('switches to the Anthropic Messages format and submits the paired endpoint', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    await user.click(screen.getByRole('combobox', { name: '接口格式' }));
    await user.click(screen.getByRole('option', { name: 'Anthropic Messages' }));
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://api.anthropic.com');
    expect(screen.getByText('AI Gateway')).toBeInTheDocument();
    expect(document.querySelector('.provider-pill')).toHaveTextContent('Anthropic Messages');
    await user.type(screen.getByLabelText('名称'), 'Claude');
    await user.type(screen.getByLabelText('模型'), 'claude-opus-5-5');
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        type: 'anthropic-messages',
        endpointMode: 'messages',
        baseURL: 'https://api.anthropic.com',
      }),
    }));
  });

  it('keeps a custom Base URL when the format changes', async () => {
    const user = userEvent.setup();
    renderForm({ initialConfig: configured });
    await user.click(screen.getByRole('combobox', { name: '接口格式' }));
    await user.click(screen.getByRole('option', { name: 'Anthropic Messages' }));
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://gateway.example.com/v1');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PermissionSettings } from '../../../../components/settings/PermissionSettings';

function renderSettings(overrides: Partial<React.ComponentProps<typeof PermissionSettings>> = {}) {
  const props: React.ComponentProps<typeof PermissionSettings> = {
    pageAccessMode: 'active-tab',
    selectionButtonEnabled: true,
    siteDenylist: [],
    onEnableAutomatic: vi.fn(async () => ({ granted: true })),
    onDisableAutomatic: vi.fn(async () => undefined),
    onSelectionButtonChange: vi.fn(async () => undefined),
    onDenylistChange: vi.fn(async () => undefined),
    ...overrides,
  };
  render(<PermissionSettings {...props} />);
  return props;
}

describe('PermissionSettings', () => {
  it('defaults to user-gesture-only page access', () => {
    renderSettings();
    expect(screen.getByRole('radio', { name: '仅在点击插件时运行' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '自动在网站上启用' })).not.toBeChecked();
  });

  it('requests automatic website access from the user action and keeps the default when denied', async () => {
    const user = userEvent.setup();
    const onEnableAutomatic = vi.fn(async () => ({ granted: false }));
    renderSettings({ onEnableAutomatic });

    await user.click(screen.getByRole('radio', { name: '自动在网站上启用' }));
    expect(onEnableAutomatic).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: '仅在点击插件时运行' })).toBeChecked();
    expect(await screen.findByRole('status')).toHaveTextContent('未授予网站访问权限');
  });

  it('offers permission removal when automatic access is disabled', async () => {
    const user = userEvent.setup();
    const onDisableAutomatic = vi.fn(async () => undefined);
    renderSettings({ pageAccessMode: 'all-sites', onDisableAutomatic });

    expect(screen.getByRole('radio', { name: '自动在网站上启用' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: '仅在点击插件时运行' }));
    expect(await screen.findByRole('dialog', { name: '关闭自动网站访问' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: '同时移除 HTTP 和 HTTPS 网站访问权限' }));
    await user.click(screen.getByRole('button', { name: '确认关闭自动访问' }));
    expect(onDisableAutomatic).toHaveBeenCalledWith(true);
  });

  it('adds normalized excluded sites and rejects invalid patterns', async () => {
    const user = userEvent.setup();
    const onDenylistChange = vi.fn(async () => undefined);
    renderSettings({ onDenylistChange });

    await user.type(screen.getByLabelText('排除的网站'), 'https://accounts.example.com/login');
    await user.click(screen.getByRole('button', { name: '添加排除网站' }));
    expect(onDenylistChange).toHaveBeenCalledWith(['accounts.example.com']);

    await user.clear(screen.getByLabelText('排除的网站'));
    await user.type(screen.getByLabelText('排除的网站'), 'chrome://settings');
    await user.click(screen.getByRole('button', { name: '添加排除网站' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请输入 HTTP 或 HTTPS 网站');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../../entrypoints/sidepanel/App';

afterEach(() => {
  Reflect.deleteProperty(window, 'documentPictureInPicture');
});

describe('Side Panel App', () => {
  it('renders the Chrome-native header actions', () => {
    render(<App />);
    expect(screen.queryByRole('heading', { name: '问问 AI' })).not.toBeInTheDocument();
    expect(screen.queryByText('你的浏览器助手')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新对话' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '历史记录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更多操作' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: '设置' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '外观' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: '显示语言' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '切换主题颜色' })).not.toBeInTheDocument();
  });

  it('opens the more menu with settings and theme, and closes it with Escape', async () => {
    const user = userEvent.setup();
    render(<App />);

    const more = screen.getByRole('button', { name: '更多操作' });
    await user.click(more);

    expect(more).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: '更多操作' });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '设置' })).toHaveFocus();
    expect(screen.getByRole('menuitem', { name: '切换主题颜色' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '浮动显示' })).not.toBeInTheDocument();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: '切换主题颜色' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });


  it('calls onSettings when the settings button is clicked', async () => {
    const user = userEvent.setup();
    const onSettings = vi.fn();
    render(<App onSettings={onSettings} />);

    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByRole('menuitem', { name: '设置' }));
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('places the current-page retry action first in the more menu, directly before settings', async () => {
    const user = userEvent.setup();
    const onRetryPageContext = vi.fn();
    render(<App
      context={{ status: 'unavailable', reason: 'CONTEXT_EXTRACTION_FAILED' }}
      onRetryPageContext={onRetryPageContext}
    />);

    await user.click(screen.getByRole('button', { name: '更多操作' }));
    const retry = screen.getByRole('menuitem', { name: '重新读取当前页' });
    const settings = screen.getByRole('menuitem', { name: '设置' });
    expect(retry.nextElementSibling).toBe(settings);

    await user.click(retry);
    expect(onRetryPageContext).toHaveBeenCalledTimes(1);
  });

  it('shows the header retry action as busy while rereading the page', async () => {
    const user = userEvent.setup();
    render(<App
      context={{ status: 'preparing' }}
      onRetryPageContext={vi.fn()}
      pageContextRetrying
    />);

    await user.click(screen.getByRole('button', { name: '更多操作' }));
    const retry = screen.getByRole('menuitem', { name: '正在重新读取当前页' });
    expect(retry).toBeDisabled();
    expect(retry).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the floating chat action when the in-page floating chat is available', async () => {
    const user = userEvent.setup();
    render(<App floatingSupported />);

    await user.click(screen.getByRole('button', { name: '更多操作' }));
    expect(screen.getByRole('menuitem', { name: '浮动显示' })).toBeInTheDocument();
  });

  it('does not duplicate a global protocol error under a page quick-action error', () => {
    render(<App
      errorMessage="消息格式无效"
      quickActionErrorMessage="无法读取当前页面内容。请打开普通网页或允许页面访问后重试。"
    />);

    expect(screen.getByRole('alert')).toHaveTextContent('无法读取当前页面内容');
    expect(screen.queryByText('消息格式无效')).not.toBeInTheDocument();
  });

  it('offers only supported quick actions and routes the selected prompt', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<App onSend={onSend} />);

    expect(screen.getByRole('button', { name: '总结' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '解释' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '翻译' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '提取要点' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '分析技术栈' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '生成回复' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '总结' }));
    expect(onSend).toHaveBeenCalledWith('总结当前页面，先给一句话结论，再列出关键要点。');
  });

  it('shows the shortcuts chosen in settings and runs a skill shortcut as a skill', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const skills = [{ id: 'skill-1', name: '周报', prompt: '整理成周报', createdAt: 1, updatedAt: 1 }];
    render(<App onSend={onSend} skills={skills} newChatShortcuts={[
      { type: 'skill', id: 'skill-1' },
      { type: 'action', id: 'translate' },
      { type: 'skill', id: 'deleted-skill' },
    ]} />);

    expect(screen.getAllByRole('button', { name: /^(周报|翻译|总结|解释|分析技术栈)$/ }).map((button) => button.textContent)).toEqual(['周报', '翻译']);
    await user.click(screen.getByRole('button', { name: '周报' }));
    expect(onSend).toHaveBeenCalledWith('', [], { name: '周报', prompt: '整理成周报' });
  });

  it('keeps the draft when the chat stream cannot accept the message', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => false);
    render(<App onSend={onSend} />);

    const input = screen.getByRole('combobox', { name: '消息' });
    await user.type(input, '不要丢失这条消息');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(onSend).toHaveBeenCalledWith('不要丢失这条消息');
    expect(input).toHaveValue('不要丢失这条消息');
  });

});

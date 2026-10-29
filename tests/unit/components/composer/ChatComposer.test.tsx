import { act, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatComposer } from '../../../../components/composer/ChatComposer';
import { AppError } from '../../../../shared/errors/app-error';

function ControlledComposer({ onSend = vi.fn(), streaming = false, onStop = vi.fn() }) {
  return (
    <ChatComposer
      value="帮我总结"
      onChange={vi.fn()}
      onSend={onSend}
      streaming={streaming}
      onStop={onStop}
      model="gpt-test"
      models={['gpt-test', 'gpt-alt']}
    />
  );
}

describe('ChatComposer', () => {
  it('sends on Enter but preserves Shift+Enter for a newline', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ControlledComposer onSend={onSend} />);
    const textbox = screen.getByRole('textbox', { name: '消息' });

    await user.click(textbox);
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onSend).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('帮我总结');
  });

  it('disables the stop action after cancellation has already been requested', () => {
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        streaming
        stopDisabled
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '停止生成' })).toBeDisabled();
  });

  it('switches the primary action from send to stop while streaming', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    const { rerender } = render(<ControlledComposer onStop={onStop} />);
    expect(screen.getByRole('button', { name: '发送' })).toBeInTheDocument();

    rerender(<ControlledComposer streaming onStop={onStop} />);
    await user.click(screen.getByRole('button', { name: '停止生成' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
  it('offers available models and reports the selected model', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        model="gpt-test"
        models={['gpt-test', 'gpt-alt']}
        onModelChange={onModelChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: '模型: gpt-test' }));
    expect(screen.getByRole('option', { name: 'gpt-test' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('option', { name: 'gpt-alt' }));
    expect(onModelChange).toHaveBeenCalledWith('gpt-alt');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('filters models with the search box and picks one with the keyboard', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        model="gpt-4o"
        models={['gpt-4o', 'claude-sonnet', 'claude-haiku', 'gemini-pro']}
        onModelChange={onModelChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: '模型: gpt-4o' }));
    const search = screen.getByRole('combobox', { name: '搜索模型' });
    expect(search).toHaveFocus();

    await user.type(search, 'CLAUDE');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['claude-sonnet', 'claude-haiku']);

    await user.keyboard('{ArrowDown}{Enter}');
    expect(onModelChange).toHaveBeenCalledWith('claude-haiku');
    expect(screen.getByRole('button', { name: '模型: gpt-4o' })).toHaveFocus();
  });

  it('shows an empty state and closes on Escape without changing the model', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();
    render(
      <ChatComposer value="" onChange={vi.fn()} onSend={vi.fn()} model="gpt-4o" models={['gpt-4o']} onModelChange={onModelChange} />,
    );

    await user.click(screen.getByRole('button', { name: '模型: gpt-4o' }));
    await user.type(screen.getByRole('combobox', { name: '搜索模型' }), 'nothing');
    expect(screen.getByText('没有匹配的模型')).toBeInTheDocument();

    await user.keyboard('{Enter}{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onModelChange).not.toHaveBeenCalled();
  });

  it('closes the model picker when clicking outside', async () => {
    const user = userEvent.setup();
    render(<ChatComposer value="" onChange={vi.fn()} onSend={vi.fn()} model="gpt-4o" models={['gpt-4o', 'gpt-alt']} />);

    await user.click(screen.getByRole('button', { name: '模型: gpt-4o' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('toggles one-message page actions and exposes the pressed state', async () => {
    const user = userEvent.setup();
    const onPageActionsEnabledChange = vi.fn();
    const { rerender } = render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        pageActionsEnabled={false}
        onPageActionsEnabledChange={onPageActionsEnabledChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    const toggle = screen.getByRole('menuitemcheckbox', { name: '操作网页' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(onPageActionsEnabledChange).toHaveBeenCalledWith(true);

    rerender(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        pageActionsEnabled
        onPageActionsEnabledChange={onPageActionsEnabledChange}
      />,
    );
    // Enabled state is surfaced as a chip next to the input that turns it off.
    await user.click(screen.getByRole('button', { name: '关闭网页操作' }));
    expect(onPageActionsEnabledChange).toHaveBeenLastCalledWith(false);
  });

  it('disables page actions when the current page is unavailable', async () => {
    const user = userEvent.setup();
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        pageActionsDisabled
      />,
    );
    await user.click(screen.getByRole('button', { name: '添加内容' }));
    expect(screen.getByRole('menuitemcheckbox', { name: '操作网页' })).toBeDisabled();
  });

  it('offers full and free screenshot modes from the composer toolbar', async () => {
    const user = userEvent.setup();
    const onCaptureScreenshot = vi.fn();
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        onSelectFiles={vi.fn()}
        onCaptureScreenshot={onCaptureScreenshot}
      />,
    );

    const toolsButton = screen.getByRole('button', { name: '添加内容' });
    expect(toolsButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('AI 可能会出错，请核对重要信息。')).not.toBeInTheDocument();

    await user.click(toolsButton);
    expect(toolsButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: '上传文件' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '从屏幕上选择' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: '操作网页' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '全屏截图' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: '从屏幕上选择' }));
    expect(onCaptureScreenshot).toHaveBeenLastCalledWith('region');
  });

  it('closes the screenshot menu with Escape and restores button focus', async () => {
    const user = userEvent.setup();
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        onCaptureScreenshot={vi.fn()}
      />,
    );
    const toolsButton = screen.getByRole('button', { name: '添加内容' });
    await user.click(toolsButton);
    expect(screen.getByRole('menu', { name: '添加内容' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: '添加内容' })).not.toBeInTheDocument();
    expect(toolsButton).toHaveFocus();
  });

  it('accepts supported image files from the hidden picker', async () => {
    const user = userEvent.setup();
    const onSelectFiles = vi.fn();
    const { container } = render(
      <ChatComposer value="" onChange={vi.fn()} onSend={vi.fn()} onSelectFiles={onSelectFiles} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image-bytes'], 'diagram.png', { type: 'image/png' });

    expect(input).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp,image/gif,.pdf,.doc,.docx,.xls,.xlsx,.txt,.log,.md,.markdown,.csv,.tsv,.json,.xml,.html,.htm');
    expect(input).toHaveAttribute('multiple');
    await user.upload(input, file);
    expect(onSelectFiles).toHaveBeenCalledWith([file]);
  });

  it('previews and removes attachments and allows an image-only message', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const onRemoveAttachment = vi.fn();
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSend={onSend}
        attachments={[{
          id: 'image-1',
          name: 'screen.jpg',
          mimeType: 'image/jpeg',
          dataUrl: 'data:image/jpeg;base64,aGVsbG8=',
          source: 'screenshot',
        }]}
        onRemoveAttachment={onRemoveAttachment}
      />,
    );

    expect(screen.getByRole('img', { name: 'screen.jpg' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(onSend).toHaveBeenCalledWith('');
    await user.click(screen.getByRole('button', { name: '移除附件：screen.jpg' }));
    expect(onRemoveAttachment).toHaveBeenCalledWith('image-1');
  });


  it('previews document attachments without treating them as images', () => {
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        attachments={[{
          kind: 'document',
          id: 'document-1',
          name: 'report.pdf',
          mimeType: 'application/pdf',
          size: 1_024,
          text: 'Quarterly report',
          source: 'upload',
          truncated: false,
        }]}
      />,
    );

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled();
  });


  it('opens the tab picker with “@”, filters by keyboard input, and removes the query on select', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const loadCandidates = vi.fn(async () => [
      { tabId: 1, title: '当前文章', url: 'https://example.com/a', active: true, supported: true },
      { tabId: 2, title: 'GitHub', url: 'https://github.com/', active: false, supported: true },
      { tabId: 3, title: '新标签页', url: 'chrome://newtab/', active: false, supported: false },
    ]);
    function MentionComposer() {
      const [value, setValue] = useState('');
      return (
        <ChatComposer
          value={value}
          onChange={setValue}
          onSend={vi.fn()}
          tabMention={{ loadCandidates, onSelect, selectedTabIds: [1] }}
        />
      );
    }
    render(<MentionComposer />);
    const textbox = screen.getByRole('combobox', { name: '消息' });

    await user.type(textbox, '对比 @git');
    expect(loadCandidates).toHaveBeenCalledTimes(1);
    const listbox = await screen.findByRole('listbox', { name: '选择要分享的标签页' });
    expect(within(listbox).getAllByRole('option')).toHaveLength(1);
    expect(within(listbox).getByText('GitHub')).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ tabId: 2 }));
    expect(textbox).toHaveValue('对比 ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens all tabs from “Add more tabs” and ignores unsupported tabs', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        tabMention={{
          loadCandidates: async () => [{ tabId: 3, title: '新标签页', url: 'chrome://newtab/', active: false, supported: false }],
          onSelect,
          selectedTabIds: [],
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('menuitem', { name: '添加更多标签页' }));
    const option = await screen.findByRole('menuitemcheckbox', { name: /新标签页/ });
    expect(option).toBeDisabled();
    expect(option).toHaveAttribute('title', '不支持读取');
    await user.pointer({ keys: '[MouseLeft]', target: option });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('explains when the tabs permission is denied', async () => {
    const user = userEvent.setup();
    render(
      <ChatComposer value="" onChange={vi.fn()} onSend={vi.fn()} tabMention={{ loadCandidates: async () => undefined, onSelect: vi.fn(), selectedTabIds: [] }} />,
    );
    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('menuitem', { name: '添加更多标签页' }));
    expect(await screen.findByText('需要授予“读取标签页”和网站访问权限才能选择其他标签页')).toBeInTheDocument();
  });

  it('rotates the @ and / hints in the placeholder one at a time', () => {
    vi.useFakeTimers();
    try {
      render(<ChatComposer value="" onChange={vi.fn()} onSend={vi.fn()} />);
      const textbox = screen.getByRole('textbox', { name: '消息' });
      expect(textbox).toHaveAttribute('placeholder', '输入 @ 即可添加标签页');
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(textbox).toHaveAttribute('placeholder', '输入 / 即可使用技能');
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(textbox).toHaveAttribute('placeholder', '输入 @ 即可添加标签页');
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns “+” into “×” and plays a close animation before removing the menu', async () => {
    const user = userEvent.setup();
    render(<ChatComposer value="" onChange={vi.fn()} onSend={vi.fn()} onSelectFiles={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: '添加内容' });
    await user.click(toggle);
    expect(toggle).toHaveClass('composer-tool-button--open');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).not.toHaveClass('composer-tool-button--open');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.querySelector('.composer-menu__popover--closing')).not.toBeNull();
    await waitFor(() => expect(document.querySelector('.composer-menu__popover')).toBeNull());
  });

  const savedSkills = [
    { id: 's-hi', name: 'hi', prompt: '用友好的语气打招呼', createdAt: 1, updatedAt: 1 },
    { id: 's-test', name: 'test', prompt: '为内容写测试用例', createdAt: 2, updatedAt: 2 },
  ];

  function SkillHarness({ onSend = vi.fn(), onSaveSkill, onDeleteSkill }: {
    onSend?: (message: string) => void;
    onSaveSkill?: (draft: { id?: string; name: string; prompt: string }) => typeof savedSkills[number];
    onDeleteSkill?: (id: string) => void;
  }) {
    const [value, setValue] = useState('');
    const [skill, setSkill] = useState<typeof savedSkills[number]>();
    return (
      <ChatComposer
        value={value}
        onChange={setValue}
        onSend={onSend}
        skills={savedSkills}
        selectedSkill={skill}
        onSelectSkill={setSkill}
        onSaveSkill={onSaveSkill ?? ((draft) => ({ id: draft.id ?? 's-new', name: draft.name, prompt: draft.prompt, createdAt: 3, updatedAt: 3 }))}
        onDeleteSkill={onDeleteSkill}
      />
    );
  }

  it('lists saved skills and “Add skill” on “/”, and shows the chosen skill as “/name” in the input', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<SkillHarness onSend={onSend} />);
    const textbox = screen.getByRole('combobox', { name: '消息' });

    await user.type(textbox, '/');
    const listbox = screen.getByRole('listbox', { name: '选择技能' });
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual(['hi', 'test', '添加技能']);
    expect(within(listbox).getByRole('button', { name: '编辑技能：hi' })).toBeInTheDocument();

    await user.type(textbox, 'te');
    expect(within(listbox).queryByRole('option', { name: /^hi/ })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(textbox).toHaveValue('');
    expect(screen.queryByRole('listbox', { name: '选择技能' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '移除技能：test' })).toHaveTextContent('/test');

    // A skill alone is enough to send.
    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('');
  });

  it('offers saved skills from “+” → Skills and applies the chosen one', async () => {
    const user = userEvent.setup();
    const onManageSkills = vi.fn();
    function MenuHarness() {
      const [skill, setSkill] = useState<typeof savedSkills[number]>();
      return (
        <ChatComposer
          value=""
          onChange={vi.fn()}
          onSend={vi.fn()}
          skills={savedSkills}
          selectedSkill={skill}
          onSelectSkill={setSkill}
          onManageSkills={onManageSkills}
        />
      );
    }
    render(<MenuHarness />);

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('menuitem', { name: '技能' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['返回', 'hi', 'test', '管理技能']);

    await user.click(within(menu).getByRole('menuitem', { name: '返回' }));
    expect(await screen.findByRole('menuitem', { name: '技能' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: '技能' }));
    await user.click(screen.getByRole('menuitem', { name: 'test' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '移除技能：test' })).toHaveTextContent('/test');

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(await screen.findByRole('menuitem', { name: '技能' }));
    await user.click(screen.getByRole('menuitem', { name: '管理技能' }));
    expect(onManageSkills).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('runs a new chat shortcut from the “+” menu submenu', async () => {
    const user = userEvent.setup();
    const summarize = vi.fn();
    const translate = vi.fn();
    const onManage = vi.fn();
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        onSelectSkill={vi.fn()}
        newChatShortcuts={[
          { key: '0:action:summarize', label: '总结', title: '总结当前页面', run: summarize },
          { key: '1:action:translate', label: '翻译', run: translate },
        ]}
        onManageNewChatShortcuts={onManage}
      />
    );

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('menuitem', { name: '快捷方式' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['返回', '总结', '翻译', '管理快捷方式']);
    expect(within(menu).getByRole('menuitem', { name: '总结' })).toHaveAttribute('title', '总结当前页面');

    await user.click(within(menu).getByRole('menuitem', { name: '翻译' }));
    expect(translate).toHaveBeenCalledTimes(1);
    expect(summarize).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(await screen.findByRole('menuitem', { name: '快捷方式' }));
    await user.click(screen.getByRole('menuitem', { name: '管理快捷方式' }));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('shows an empty note and disables shortcuts in the new chat shortcut submenu when appropriate', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ChatComposer value="" onChange={vi.fn()} onSend={vi.fn()} newChatShortcuts={[]} />);
    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('menuitem', { name: '快捷方式' }));
    expect(screen.getByText('未设置快捷方式')).toBeInTheDocument();

    rerender(<ChatComposer value="" onChange={vi.fn()} onSend={vi.fn()} newChatShortcuts={[{ key: 'a', label: '总结', run: vi.fn() }]} newChatShortcutsDisabled />);
    expect(screen.getByRole('menuitem', { name: '总结' })).toBeDisabled();
  });

  it('shows an empty note in the Skills submenu when nothing is saved', async () => {
    const user = userEvent.setup();
    render(<ChatComposer value="" onChange={vi.fn()} onSend={vi.fn()} skills={[]} onSelectSkill={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('menuitem', { name: '技能' }));
    expect(screen.getByText('还没有技能')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '管理技能' })).not.toBeInTheDocument();
  });

  it('removes the applied skill with Backspace at the start of the input', async () => {
    const user = userEvent.setup();
    render(<SkillHarness />);
    const textbox = screen.getByRole('combobox', { name: '消息' });
    await user.type(textbox, '/hi{Enter}');
    expect(screen.getByRole('button', { name: '移除技能：hi' })).toBeInTheDocument();
    await user.keyboard('{Backspace}');
    expect(screen.queryByRole('button', { name: '移除技能：hi' })).not.toBeInTheDocument();
  });

  it('creates a skill from “Add skill” and applies it right away', async () => {
    const user = userEvent.setup();
    const onSaveSkill = vi.fn((draft: { id?: string; name: string; prompt: string }) => (
      { id: 's-new', name: draft.name, prompt: draft.prompt, createdAt: 3, updatedAt: 3 }
    ));
    render(<SkillHarness onSaveSkill={onSaveSkill} />);
    const textbox = screen.getByRole('combobox', { name: '消息' });

    await user.type(textbox, '/周报');
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: '添加技能' });
    expect(within(dialog).getByRole('textbox', { name: /名称/ })).toHaveValue('周报');

    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('请输入技能指令');

    await user.type(within(dialog).getByRole('textbox', { name: '指令' }), '整理成周报');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(onSaveSkill).toHaveBeenCalledWith({ name: '周报', prompt: '整理成周报' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(textbox).toHaveValue('');
    expect(screen.getByRole('button', { name: '移除技能：周报' })).toBeInTheDocument();
  });

  it('edits and deletes a skill from the pencil button', async () => {
    const user = userEvent.setup();
    const onSaveSkill = vi.fn((draft: { id?: string; name: string; prompt: string }) => (
      { id: draft.id!, name: draft.name, prompt: draft.prompt, createdAt: 1, updatedAt: 4 }
    ));
    const onDeleteSkill = vi.fn();
    render(<SkillHarness onSaveSkill={onSaveSkill} onDeleteSkill={onDeleteSkill} />);
    const textbox = screen.getByRole('combobox', { name: '消息' });

    await user.type(textbox, '/');
    await user.click(screen.getByRole('button', { name: '编辑技能：hi' }));
    let dialog = screen.getByRole('dialog', { name: '编辑技能' });
    const name = within(dialog).getByRole('textbox', { name: /名称/ });
    await user.clear(name);
    await user.type(name, 'test');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('已有同名技能');
    await user.clear(name);
    await user.type(name, 'hello');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    expect(onSaveSkill).toHaveBeenCalledWith({ id: 's-hi', name: 'hello', prompt: '用友好的语气打招呼' });
    // Editing does not apply the skill; the “/” list comes back so the user can pick one.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /移除技能/ })).not.toBeInTheDocument();
    expect(textbox).toHaveValue('/');
    expect(screen.getByRole('listbox', { name: '选择技能' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '编辑技能：test' }));
    dialog = screen.getByRole('dialog', { name: '编辑技能' });
    await user.click(within(dialog).getByRole('button', { name: '删除技能' }));
    expect(onDeleteSkill).toHaveBeenCalledWith('s-test');
  });

  it('does not open the skill picker for slashes inside words', async () => {
    const user = userEvent.setup();
    render(<SkillHarness />);
    await user.type(screen.getByRole('combobox', { name: '消息' }), 'a/b');
    expect(screen.queryByRole('listbox', { name: '选择技能' })).not.toBeInTheDocument();
  });

  it('lists the current window tabs in the “+” menu without prompting and toggles them', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onDeselect = vi.fn();
    const loadCandidates = vi.fn(async () => []);
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        tabMention={{
          loadCandidates,
          peekCandidates: async () => [
            { tabId: 2, title: 'GitHub', url: 'https://github.com/', active: false, supported: true },
            { tabId: 1, title: '文档', url: 'https://docs.example.com/', active: true, supported: true },
            { tabId: 3, title: '新标签页', url: 'chrome://newtab/', active: false, supported: false },
          ],
          onSelect,
          onDeselect,
          selectedTabIds: [1],
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    const tabs = await screen.findAllByRole('menuitemcheckbox', { name: /文档|GitHub/ });
    expect(tabs.map((item) => item.textContent)).toEqual(['文档 · 当前标签页', 'GitHub']);
    expect(tabs[0]).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('menuitemcheckbox', { name: /新标签页/ })).not.toBeInTheDocument();
    expect(loadCandidates).not.toHaveBeenCalled();

    await user.click(tabs[1]!);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ tabId: 2 }));
    // Picking a tab keeps the menu open so more tabs can be added.
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitemcheckbox', { name: /文档/ }));
    expect(onDeselect).toHaveBeenCalledWith(expect.objectContaining({ tabId: 1 }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('lists every tab in the “Add more tabs” submenu without closing the menu', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const tabs = [
      { tabId: 2, title: 'GitHub', url: 'https://github.com/', active: false, supported: true },
      { tabId: 1, title: '文档', url: 'https://docs.example.com/', active: true, supported: true },
      { tabId: 4, title: 'Stripe', url: 'https://stripe.com/', active: false, supported: true },
      { tabId: 5, title: 'Google', url: 'https://google.com/', active: false, supported: true },
      { tabId: 3, title: '新标签页', url: 'chrome://newtab/', active: false, supported: false },
    ];
    const loadCandidates = vi.fn(async () => tabs);
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        tabMention={{ loadCandidates, peekCandidates: async () => tabs, onSelect, selectedTabIds: [] }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(await screen.findByRole('menuitem', { name: '添加更多标签页' }));
    expect(loadCandidates).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('menuitem', { name: '返回' })).toBeInTheDocument();
    const items = await screen.findAllByRole('menuitemcheckbox');
    expect(items.map((item) => item.textContent)).toEqual(['文档 · 当前标签页', 'GitHub', 'Stripe', 'Google', '新标签页']);
    expect(items[4]).toBeDisabled();

    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Stripe' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Google' }));
    expect(onSelect.mock.calls.map(([tab]) => tab.tabId)).toEqual([4, 5]);
    expect(screen.getByRole('menuitem', { name: '返回' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: '返回' }));
    expect(await screen.findByRole('menuitem', { name: '添加更多标签页' })).toBeInTheDocument();
  });

  it('switches to a multiline layout after Shift+Enter and back when cleared', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState('');
      return <ChatComposer value={value} onChange={setValue} onSend={vi.fn()} />;
    }
    const { container } = render(<Harness />);
    const textbox = screen.getByRole('textbox', { name: '消息' });
    const row = container.querySelector('.chat-composer__row')!;

    await user.type(textbox, '第一行');
    expect(row).not.toHaveClass('chat-composer__row--multiline');
    await user.keyboard('{Shift>}{Enter}{/Shift}第二行');
    expect(textbox).toHaveValue('第一行\n第二行');
    expect(row).toHaveClass('chat-composer__row--multiline');

    await user.clear(textbox);
    expect(row).not.toHaveClass('chat-composer__row--multiline');
  });

  it('opens the AI Writing Assistant from the “+” menu and puts the polished text into the input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rewrite = vi.fn(async () => '润色后的文字');
    render(
      <ChatComposer
        value="原始草稿"
        onChange={onChange}
        onSend={vi.fn()}
        model="gpt-test"
        models={['gpt-test']}
        writingRewrite={rewrite}
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('menuitem', { name: 'AI 写作助手' }));
    const dialog = await screen.findByRole('dialog', { name: 'AI 写作助手' });
    const source = within(dialog).getByRole('textbox', { name: '原文' });
    expect(source).toHaveValue('原始草稿');

    await user.clear(source);
    await user.type(source, '第一行{Shift>}{Enter}{/Shift}第二行');
    await user.type(within(dialog).getByRole('textbox', { name: '语境或要求（可选）' }), '写给客户');
    await user.click(within(dialog).getByRole('button', { name: '开始润色' }));

    expect(await within(dialog).findByText('润色后的文字')).toBeInTheDocument();
    expect(rewrite).toHaveBeenCalledWith({
      text: '第一行\n第二行',
      tone: 'polish',
      instruction: '写给客户',
      model: 'gpt-test',
      locale: 'zh-CN',
    });

    await user.click(within(dialog).getByRole('button', { name: '填入输入框' }));
    expect(onChange).toHaveBeenCalledWith('润色后的文字');
    expect(screen.queryByRole('dialog', { name: 'AI 写作助手' })).not.toBeInTheDocument();
  });

  it('asks for text before polishing and shows rewrite errors', async () => {
    const user = userEvent.setup();
    const rewrite = vi.fn(async () => { throw new AppError('CONFIG_MISSING', 'missing'); });
    render(<ChatComposer value="" onChange={vi.fn()} onSend={vi.fn()} writingRewrite={rewrite} />);

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('menuitem', { name: 'AI 写作助手' }));
    const dialog = await screen.findByRole('dialog', { name: 'AI 写作助手' });

    await user.click(within(dialog).getByRole('button', { name: '开始润色' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('请先在文本框中输入需要润色的文字。');
    expect(rewrite).not.toHaveBeenCalled();

    await user.type(within(dialog).getByRole('textbox', { name: '原文' }), 'hello');
    await user.click(within(dialog).getByRole('button', { name: '开始润色' }));
    expect(await within(dialog).findByRole('alert')).not.toHaveTextContent('请先在文本框中输入需要润色的文字。');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

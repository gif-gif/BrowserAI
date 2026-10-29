import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SkillEditorDialog } from '../../../../components/composer/SkillEditorDialog';
import { AppError } from '../../../../shared/errors/app-error';

function renderDialog(improvePrompt?: (prompt: string, locale: string) => Promise<string>) {
  const onSave = vi.fn();
  render(
    <SkillEditorDialog
      draft={{ name: 'test', prompt: '分析木头' }}
      skills={[]}
      onSave={onSave}
      onClose={vi.fn()}
      improvePrompt={improvePrompt}
    />,
  );
  return { onSave, textarea: screen.getByRole('textbox', { name: '指令' }) };
}

describe('SkillEditorDialog prompt tools', () => {
  it('improves the instructions with AI and undoes or redoes the rewrite', async () => {
    const user = userEvent.setup();
    const improvePrompt = vi.fn(async () => '分析当前网页中与木头相关的信息，并以结构化列表输出。');
    const { textarea } = renderDialog(improvePrompt);

    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重做' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '使用 AI 改进' }));
    await waitFor(() => expect(textarea).toHaveValue('分析当前网页中与木头相关的信息，并以结构化列表输出。'));
    expect(improvePrompt).toHaveBeenCalledWith('分析木头', 'zh-CN');

    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(textarea).toHaveValue('分析木头');
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '重做' }));
    expect(textarea).toHaveValue('分析当前网页中与木头相关的信息，并以结构化列表输出。');
  });

  it('undoes typing with the toolbar and keyboard shortcuts', async () => {
    const user = userEvent.setup();
    const { textarea } = renderDialog(async (prompt) => prompt);

    await user.type(textarea, '的属性');
    expect(textarea).toHaveValue('分析木头的属性');

    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(textarea).toHaveValue('分析木头');

    await user.click(textarea);
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(textarea).toHaveValue('分析木头的属性');
    await user.keyboard('{Control>}z{/Control}');
    expect(textarea).toHaveValue('分析木头');
  });

  it('shows a localized error and keeps the text when improving fails', async () => {
    const user = userEvent.setup();
    const { textarea } = renderDialog(async () => { throw new AppError('CONFIG_MISSING', '尚未配置 AI Gateway'); });

    await user.click(screen.getByRole('button', { name: '使用 AI 改进' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('尚未配置 AI Gateway');
    expect(textarea).toHaveValue('分析木头');
  });

  it('disables improving for empty instructions', async () => {
    const user = userEvent.setup();
    const { textarea } = renderDialog(async (prompt) => prompt);
    await user.clear(textarea);
    expect(screen.getByRole('button', { name: '使用 AI 改进' })).toBeDisabled();
  });
});

describe('SkillEditorDialog without an extension runtime', () => {
  it('still offers undo and redo but no AI improve button', () => {
    render(<SkillEditorDialog draft={{ name: '', prompt: '' }} skills={[]} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: '撤销' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '使用 AI 改进' })).not.toBeInTheDocument();
  });
});

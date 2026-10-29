import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowseSkills, YourSkills } from '../../../components/settings/SkillSettings';
import { STORAGE_KEYS } from '../../../shared/constants/storage-keys';
import type { Skill } from '../../../shared/types/skill';

afterEach(() => vi.unstubAllGlobals());

function stubStorage(initial: Skill[]) {
  const state = { stored: initial };
  const set = vi.fn(async (items: Record<string, unknown>) => { state.stored = items[STORAGE_KEYS.skills] as Skill[]; });
  vi.stubGlobal('browser', {
    storage: {
      local: { get: vi.fn(async () => ({ [STORAGE_KEYS.skills]: state.stored })), set },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });
  return state;
}

function cardTitles(container: HTMLElement) {
  return within(container).getAllByRole('listitem').map((item) => item.querySelector('strong')?.textContent);
}

describe('YourSkills', () => {
  it('shows skills as cards and saves additions, edits and deletions', async () => {
    const user = userEvent.setup();
    const state = stubStorage([{ id: 's-hi', name: 'hi', prompt: '打招呼', createdAt: 1, updatedAt: 1 }]);
    render(<YourSkills />);

    expect(await screen.findByText('hi')).toBeInTheDocument();
    expect(screen.getByText('打招呼')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑技能：hi' })).toHaveTextContent('修改');

    await user.click(screen.getByRole('button', { name: '添加技能' }));
    const dialog = screen.getByRole('dialog', { name: '添加技能' });
    await user.type(within(dialog).getByRole('textbox', { name: /名称/ }), '周报');
    await user.type(within(dialog).getByRole('textbox', { name: '指令' }), '整理成周报');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('周报')).toBeInTheDocument();
    expect(state.stored.map((skill) => skill.name)).toEqual(['hi', '周报']);

    await user.click(screen.getByRole('button', { name: '编辑技能：hi' }));
    expect(screen.getByRole('dialog', { name: '编辑技能' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '取消' }));

    await user.click(screen.getByRole('button', { name: '更多操作：hi' }));
    await user.click(screen.getByRole('menuitem', { name: '删除技能' }));
    await waitFor(() => expect(screen.queryByText('hi')).not.toBeInTheDocument());
    expect(state.stored.map((skill) => skill.name)).toEqual(['周报']);
  });

  it('filters cards by the search query', () => {
    const skills: Skill[] = [
      { id: 'a', name: 'hi', prompt: '打招呼', createdAt: 1, updatedAt: 1 },
      { id: 'b', name: 'test', prompt: '写测试', createdAt: 2, updatedAt: 2 },
    ];
    const { rerender } = render(<YourSkills skills={skills} query="测试" />);
    expect(cardTitles(screen.getByRole('region', { name: '您的技能' }))).toEqual(['test']);
    rerender(<YourSkills skills={skills} query="nothing" />);
    expect(screen.getByText('没有匹配的技能')).toBeInTheDocument();
  });

  it('shows an empty state without saved skills', () => {
    render(<YourSkills skills={[]} />);
    expect(screen.getByText('还没有技能')).toBeInTheDocument();
  });
});

describe('BrowseSkills', () => {
  it('shows featured cards and filters the catalog by category', async () => {
    const user = userEvent.setup();
    render(<BrowseSkills skills={[]} />);
    expect(cardTitles(screen.getByRole('region', { name: '精选技能' }))).toEqual(['总结', '解释', '翻译', '分析技术栈', '高蛋白顶配版', '餐食规划助手', '礼物甄选顾问']);

    const browse = screen.getByRole('region', { name: '浏览技能' });
    expect(within(browse).getAllByRole('listitem')).toHaveLength(53);
    expect(within(browse).getAllByText('Browser AI')).toHaveLength(53);
    expect(within(browse).getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(browse).getByRole('button', { name: '购物' }));
    expect(cardTitles(browse)).toEqual([
      '购买建议', '总结评价', '规格识别', '比价助手', '核验退货政策', '选码助手',
      '查看保修信息', '礼物评估', '比较打开的标签页', '制作购物清单', '选购服装和配饰',
    ]);
    expect(within(browse).getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds a catalog skill to your skills and marks it as added', async () => {
    const user = userEvent.setup();
    const state = stubStorage([]);
    render(<BrowseSkills />);
    const featured = screen.getByRole('region', { name: '精选技能' });

    await user.click(within(featured).getByRole('button', { name: '添加技能：高蛋白顶配版' }));
    await waitFor(() => expect(state.stored.map((skill) => skill.name)).toEqual(['高蛋白顶配版']));
    expect(state.stored[0]?.prompt).toContain('最大限度地提高食谱的整体蛋白质含量');
    expect(within(featured).getByText('已添加')).toBeInTheDocument();
    expect(within(featured).queryByRole('button', { name: '添加技能：高蛋白顶配版' })).not.toBeInTheDocument();
  });
});

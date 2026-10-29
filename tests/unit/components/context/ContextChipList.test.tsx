import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContextChipList } from '../../../../components/context/ContextChipList';
import type { ExtractedPageContext } from '../../../../shared/types/context';

const snapshot: ExtractedPageContext = {
  snapshotId: 'snapshot-1',
  tabId: 7,
  title: '示例文章',
  url: 'https://example.com/article',
  selection: { text: '一段选中的内容' },
  document: { text: '正文', extractionMethod: 'readability' },
  metadata: {
    extractedAt: 1,
    originalCharacterCount: 100,
    submittedCharacterCount: 100,
    truncated: false,
    navigationKey: 'nav-1',
  },
};

describe('ContextChipList', () => {
  it.each([
    [{ status: 'preparing' } as const, '当前页 · 正在准备'],
    [{ status: 'ready', snapshot } as const, '正在分享“示例文章”标签页'],
    [{ status: 'changed' } as const, '当前页 · 页面已变化'],
    [{ status: 'unavailable', reason: 'PAGE_UNSUPPORTED' } as const, '当前页 · 不可用'],
  ])('shows the page context status for %s', (context, label) => {
    render(<ContextChipList context={context} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('marks truncated page context', () => {
    render(<ContextChipList context={{ status: 'ready', snapshot: { ...snapshot, metadata: { ...snapshot.metadata, truncated: true } } }} />);
    expect(screen.getByText('正在分享“示例文章”标签页')).toBeInTheDocument();
    expect(screen.getByText('已截断')).toBeInTheDocument();
  });

  it('removes the shared page with the close button and can add it back', async () => {
    const user = userEvent.setup();
    const onIncludePageChange = vi.fn();
    const { rerender } = render(
      <ContextChipList
        context={{ status: 'ready', snapshot }}
        includePage
        onIncludePageChange={onIncludePageChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: '移除当前页上下文' }));
    expect(onIncludePageChange).toHaveBeenLastCalledWith(false);

    rerender(
      <ContextChipList
        context={{ status: 'ready', snapshot }}
        includePage={false}
        onIncludePageChange={onIncludePageChange}
      />,
    );
    expect(screen.queryByText('正在分享“示例文章”标签页')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '分享当前页' }));
    expect(onIncludePageChange).toHaveBeenLastCalledWith(true);
  });

  it('renders selected text with an accessible remove control', async () => {
    const user = userEvent.setup();
    const onRemoveSelection = vi.fn();
    render(
      <ContextChipList
        context={{ status: 'ready', snapshot }}
        includePage={false}
        selectionText="一段选中的内容"
        onIncludePageChange={vi.fn()}
        onRemoveSelection={onRemoveSelection}
      />,
    );

    expect(screen.getByText('选中文本')).toBeInTheDocument();
    expect(screen.getByText('一段选中的内容')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '移除选中文本上下文' }));
    expect(onRemoveSelection).toHaveBeenCalledTimes(1);
  });

  it('collapses several shared tabs and removes one tab from the expanded list', async () => {
    const user = userEvent.setup();
    const onRemoveTab = vi.fn();
    render(
      <ContextChipList
        context={{ status: 'ready', snapshot }}
        includePage
        onIncludePageChange={vi.fn()}
        onRemoveTab={onRemoveTab}
        mentionedTabs={[
          { tabId: 8, title: 'GitHub', url: 'https://github.com/', status: 'ready', snapshotId: 's8' },
          { tabId: 9, title: '文档', url: 'https://docs.example.com/', status: 'error', errorMessage: '未授权访问该网站' },
        ]}
      />,
    );

    const summary = screen.getByRole('button', { name: '展开已分享的标签页' });
    expect(screen.getByText('正在分享 3 个标签页')).toBeInTheDocument();
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument();

    await user.click(summary);
    expect(screen.getByRole('button', { name: '收起已分享的标签页' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('示例文章')).toBeInTheDocument();
    expect(screen.getByText('当前')).toBeInTheDocument();
    expect(screen.getByText('github.com')).toBeInTheDocument();
    expect(screen.getByText('未授权访问该网站')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '移除标签页上下文：GitHub' }));
    expect(onRemoveTab).toHaveBeenCalledWith(8);
  });

  it('shows a single mentioned tab as one card when the current page is not shared', () => {
    render(
      <ContextChipList
        context={{ status: 'ready', snapshot }}
        includePage={false}
        onIncludePageChange={vi.fn()}
        mentionedTabs={[{ tabId: 8, title: 'GitHub', url: 'https://github.com/', status: 'ready' }]}
      />,
    );
    expect(screen.getByText('正在分享“GitHub”标签页')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /展开已分享/ })).not.toBeInTheDocument();
  });
});

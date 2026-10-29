import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeMarkdown } from '../../../../components/chat/SafeMarkdown';

describe('SafeMarkdown', () => {
  it('renders supported Markdown including headings, lists, tables, and fenced code', () => {
    render(<SafeMarkdown content={`# 标题\n\n- 要点一\n- 要点二\n\n| 名称 | 值 |\n| --- | --- |\n| 状态 | 正常 |\n\n\`\`\`ts\nconst answer = 42\n\`\`\``} />);

    expect(screen.getByRole('heading', { name: '标题' })).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveTextContent('要点一');
    expect(screen.getByRole('table')).toHaveTextContent('状态正常');
    const code = screen.getByText('const answer = 42');
    expect(code.tagName).toBe('CODE');
    expect(code).toHaveAttribute('data-language', 'ts');
  });

  it('does not render raw HTML or executable extension controls', () => {
    const { container } = render(
      <SafeMarkdown content={'<script>window.pwned = true</script><button>删除对话</button>\n\n[运行](chrome-extension://evil/command)'} />,
    );

    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除对话' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '运行' })).not.toBeInTheDocument();
    expect(screen.getByText('运行')).toHaveAttribute('data-blocked-link', 'true');
  });

  it('blocks unsafe URLs and makes safe external links explicit', () => {
    render(
      <SafeMarkdown content={'[危险](javascript:alert(1)) [文档](https://docs.example.com/path) ![追踪图](https://tracker.example/pixel.png)'} />,
    );

    expect(screen.queryByRole('link', { name: '危险' })).not.toBeInTheDocument();
    expect(screen.getByText('危险')).toHaveAttribute('data-blocked-link', 'true');

    const link = screen.getByRole('link', { name: '文档' });
    expect(link).toHaveAttribute('href', 'https://docs.example.com/path');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));

    expect(screen.queryByRole('img', { name: '追踪图' })).not.toBeInTheDocument();
    expect(screen.getByText('追踪图')).toHaveAttribute('data-blocked-image', 'true');
  });

  it('adds accessible table structure without injecting arbitrary attributes', () => {
    render(<SafeMarkdown content={'| A | B |\n| - | - |\n| 1 | 2 |'} />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
    expect(within(table).getAllByRole('cell')).toHaveLength(2);
  });
});

import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../../core/writing-assistant/render-markdown';

function html(markdown: string): string {
  const container = document.createElement('div');
  container.append(renderMarkdown(document, markdown));
  return container.innerHTML;
}

describe('renderMarkdown', () => {
  it('builds formatting nodes for common Markdown', () => {
    expect(html('# 标题\n\n**粗体** 和 *斜体*\n\n1. 一\n2. 二\n\n`code`')).toBe(
      '<h1>标题</h1><p><strong>粗体</strong> 和 <em>斜体</em></p><ol><li>一</li><li>二</li></ol><p><code>code</code></p>',
    );
  });

  it('never creates HTML, scripts or unsafe links from the text', () => {
    const output = html('<img src=x onerror=alert(1)> [x](javascript:alert(1)) [ok](https://example.com) ![alt](https://example.com/a.png)');
    expect(output).not.toContain('<img');
    expect(output).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(output).not.toContain('javascript:');
    expect(output).toContain('<a href="https://example.com/" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">ok</a>');
    expect(output).toContain('alt');
  });
});

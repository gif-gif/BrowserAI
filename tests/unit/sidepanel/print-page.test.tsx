import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../../entrypoints/print/App';

afterEach(() => { location.hash = ''; });

describe('print page', () => {
  it('renders the answer safely and opens the print dialog', async () => {
    location.hash = '#job-1';
    const loadJob = vi.fn(async () => ({ title: '季度回顾', content: '# 季度回顾\n\n<script>x</script>正文', createdAt: 1 }));
    const print = vi.fn();
    const { container } = render(<App loadJob={loadJob} print={print} />);

    expect(await screen.findByRole('heading', { name: '季度回顾' })).toBeInTheDocument();
    expect(loadJob).toHaveBeenCalledWith('job-1');
    expect(container.querySelector('script')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(print).toHaveBeenCalled());
    expect(document.title).toBe('季度回顾');
  });

  it('explains when the job is gone', async () => {
    location.hash = '#missing';
    render(<App loadJob={async () => undefined} print={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('要导出的内容已失效');
  });
});

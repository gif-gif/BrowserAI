import { describe, expect, it, vi } from 'vitest';
import { createContentCommandHandler, refreshSelectionActionPolicy } from '../../entrypoints/content';
import { observeSpaNavigation } from '../../core/navigation/spa-navigation-observer';

describe('content extraction messaging', () => {
  it('runs the extraction pipeline and returns a bounded snapshot', async () => {
    document.documentElement.lang = 'en';
    document.title = 'A long title';
    document.body.innerHTML = '<main><h1>Article</h1><p>This is useful page content for the current browser assistant question.</p></main>';
    Object.defineProperty(document.body, 'innerText', { configurable: true, value: 'Article\nThis is useful page content for the current browser assistant question.' });
    const handler = createContentCommandHandler({ document, tabId: 12, selectionText: () => 'chosen text', createSnapshotId: () => 'snap' });
    const result = await handler({
      version: 1, requestId: 'r1', type: 'EXTRACT_CONTEXT',
      limits: { titleCharacters: 5, selectionCharacters: 6, documentCharacters: 10 },
    });
    expect(result).toMatchObject({ snapshotId: 'snap', tabId: 12, title: 'A lon', selection: { text: 'chosen' }, document: { text: 'ArticleThi' } });
  });


  it('collects technology evidence without extracting page text or form values', async () => {
    document.head.innerHTML = '<meta name="generator" content="WordPress 6"><script src="/_next/static/app.js"></script>';
    document.body.innerHTML = '<div id="__next"><input value="private-token"><p>Private article body</p></div>';
    const handler = createContentCommandHandler({ document, tabId: 12 });

    const result = await handler({
      version: 1, requestId: 'tech-1', type: 'ANALYZE_TECH_STACK',
    });
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      generator: 'WordPress 6',
      technologies: expect.arrayContaining([
        expect.objectContaining({ name: 'Next.js', confidence: 'high' }),
        expect.objectContaining({ name: 'WordPress', confidence: 'high' }),
      ]),
    });
    expect(serialized).not.toContain('private-token');
    expect(serialized).not.toContain('Private article body');
  });

  it('keeps DOM refs stable between snapshot and action commands', async () => {
    document.body.innerHTML = '<input aria-label="Search"><button>Go</button>';
    const clicked = vi.fn();
    document.querySelector('button')!.addEventListener('click', clicked);
    const handler = createContentCommandHandler({ document, tabId: 12 });

    const snapshot = await handler({
      version: 1, requestId: 'dom-1', type: 'GET_DOM_SNAPSHOT',
    }) as { elements: Array<{ ref: string; tag: string }> };
    const input = snapshot.elements.find((item) => item.tag === 'input')!;
    const button = snapshot.elements.find((item) => item.tag === 'button')!;
    const result = await handler({
      version: 1,
      requestId: 'dom-2',
      type: 'EXECUTE_DOM_ACTIONS',
      actions: [
        { type: 'setValue', ref: input.ref, value: 'Browser AI' },
        { type: 'click', ref: button.ref },
      ],
    }) as { results: Array<{ success: boolean }> };

    expect((document.querySelector('input') as HTMLInputElement).value).toBe('Browser AI');
    expect(clicked).toHaveBeenCalledOnce();
    expect(result.results.every((item) => item.success)).toBe(true);
  });

  it('starts an interactive screenshot selection with localized labels', async () => {
    const selectScreenshotRegion = vi.fn(async () => ({
      cancelled: false as const,
      region: {
        x: 12,
        y: 24,
        width: 320,
        height: 180,
        viewportWidth: 1280,
        viewportHeight: 720,
      },
    }));
    const handler = createContentCommandHandler({
      document,
      tabId: 12,
      selectScreenshotRegion,
    });

    const result = await handler({
      version: 1,
      requestId: 'screenshot-1',
      type: 'START_SCREENSHOT_SELECTION',
      instruction: '拖动选择截图区域',
      cancelHint: '按 Esc 取消',
    });

    expect(selectScreenshotRegion).toHaveBeenCalledWith({
      instruction: '拖动选择截图区域',
      cancelHint: '按 Esc 取消',
    });
    expect(result).toMatchObject({ cancelled: false, region: { width: 320, height: 180 } });
  });

  it('disables the selection action when the background policy excludes the site', async () => {
    const setEnabled = vi.fn();
    await refreshSelectionActionPolicy(
      vi.fn(async () => ({ selectionActionEnabled: false })),
      setEnabled,
      () => 'policy-1',
    );
    expect(setEnabled).toHaveBeenCalledWith(false);
  });

  it('emits navigation changes for history transitions without a subtree observer', () => {
    const listener = vi.fn();
    const stop = observeSpaNavigation(window, listener, { pollIntervalMs: 0 });
    history.pushState({}, '', '/next');
    history.replaceState({}, '', '/final');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.lastCall?.[0]).toMatchObject({ url: expect.stringContaining('/final') });
    stop();
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { extractPageContext } from '../../../core/page-context/extract-page';

const fixture = (name: string) => readFileSync(resolve('tests/fixtures', name), 'utf8');
const limits = { titleCharacters: 500, selectionCharacters: 12_000, documentCharacters: 40_000 };

describe('extractPageContext', () => {
  it('extracts an article with Readability without mutating the original document', () => {
    const dom = new JSDOM(fixture('article-page.html'), { url: 'https://example.com/article' });
    const before = dom.window.document.documentElement.outerHTML;

    const result = extractPageContext({
      document: dom.window.document,
      tabId: 7,
      selectionText: '  当前选择  ',
      limits,
      now: () => 1234,
      createSnapshotId: () => 'snapshot-1',
      navigationKey: 'nav-1',
    });

    expect(result.document?.extractionMethod).toBe('readability');
    expect(result.document?.text).toContain('浏览器侧边栏让用户');
    expect(result.document?.text).not.toContain('订阅我们的新闻通讯');
    expect(result.selection?.text).toBe('当前选择');
    expect(result.language).toBe('zh-CN');
    expect(result.snapshotId).toBe('snapshot-1');
    expect(result.metadata.navigationKey).toBe('nav-1');
    expect(dom.window.document.documentElement.outerHTML).toBe(before);
  });

  it('falls back to sanitized body text when Readability output is insufficient', () => {
    const dom = new JSDOM(fixture('noisy-app-page.html'), { url: 'https://app.example.com/workspace' });

    const result = extractPageContext({
      document: dom.window.document,
      tabId: 3,
      limits,
      readabilityMinimumCharacters: 10_000,
      now: () => 99,
      createSnapshotId: () => 'snapshot-2',
    });

    expect(result.document?.extractionMethod).toBe('innerText');
    expect(result.document?.text).toContain('Deployment status is healthy.');
    expect(result.document?.text).not.toContain('private@example.com');
    expect(result.document?.text).not.toContain('super-secret-password');
    expect(result.document?.text).not.toContain('confidential draft value');
    expect(result.document?.text).not.toContain('script-secret');
  });

  it('applies deterministic limits and aggregate truncation metadata', () => {
    const dom = new JSDOM('<!doctype html><html><head><title>123456</title></head><body><main>abcdefghijklmnop</main></body></html>', { url: 'https://example.com/' });
    const result = extractPageContext({
      document: dom.window.document,
      tabId: 1,
      selectionText: 'selection',
      limits: { titleCharacters: 4, selectionCharacters: 5, documentCharacters: 8 },
      readabilityMinimumCharacters: 1_000,
      now: () => 10,
      createSnapshotId: () => 'fixed',
    });

    expect(result.title).toBe('1234');
    expect(result.selection?.text).toBe('selec');
    expect(result.document?.text).toBe('abcdefgh');
    expect(result.metadata).toMatchObject({
      originalCharacterCount: 31,
      submittedCharacterCount: 17,
      truncated: true,
      extractedAt: 10,
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  faviconUrl,
  filterTabCandidates,
  findMentionQuery,
  isReadableTabUrl,
  originPatternFor,
  removeMentionQuery,
} from '../../../entrypoints/sidepanel/utils/tab-mention';

describe('tab mention utilities', () => {
  it('detects an “@” query that ends at the caret', () => {
    expect(findMentionQuery('@', 1)).toEqual({ start: 0, end: 1, query: '' });
    expect(findMentionQuery('对比 @git', 7)).toEqual({ start: 3, end: 7, query: 'git' });
    expect(findMentionQuery('mail me@example.com', 19)).toBeUndefined();
    expect(findMentionQuery('@git hub', 8)).toBeUndefined();
  });

  it('removes the typed query from the draft', () => {
    const draft = '对比 @git 的内容';
    const mention = findMentionQuery(draft, 7)!;
    expect(removeMentionQuery(draft, mention)).toEqual({ value: '对比  的内容', caret: 3 });
  });

  it('filters candidates by title or host', () => {
    const tabs = [
      { tabId: 1, title: 'GitHub', url: 'https://github.com/', active: true, supported: true },
      { tabId: 2, title: '文档', url: 'https://docs.example.com/', active: false, supported: true },
    ];
    expect(filterTabCandidates(tabs, 'git').map((tab) => tab.tabId)).toEqual([1]);
    expect(filterTabCandidates(tabs, 'EXAMPLE').map((tab) => tab.tabId)).toEqual([2]);
    expect(filterTabCandidates(tabs, '')).toHaveLength(2);
  });

  it('only allows ordinary web pages and builds per-site permission patterns', () => {
    expect(isReadableTabUrl('https://example.com/a')).toBe(true);
    expect(isReadableTabUrl('chrome://newtab/')).toBe(false);
    expect(isReadableTabUrl('https://chromewebstore.google.com/detail/x')).toBe(false);
    expect(originPatternFor('https://example.com:8443/path?q=1')).toBe('https://example.com:8443/*');
    expect(originPatternFor('not a url')).toBeUndefined();
  });

  it('builds the MV3 favicon URL', () => {
    expect(faviconUrl('https://example.com/a', 'chrome-extension://abc/')).toBe(
      'chrome-extension://abc/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2Fa&size=32',
    );
  });

  it('detects a “/” skill trigger only at a word start', () => {
    expect(findMentionQuery('/sum', 4, '/')).toEqual({ start: 0, end: 4, query: 'sum' });
    expect(findMentionQuery('hi /t', 5, '/')).toEqual({ start: 3, end: 5, query: 't' });
    expect(findMentionQuery('a/b', 3, '/')).toBeUndefined();
  });
});

import type { TabCandidate } from '../../../shared/types/tab-mention';

export interface MentionQuery {
  /** Index of the “@” character in the draft. */
  start: number;
  /** Caret position that ends the query. */
  end: number;
  query: string;
}

/**
 * Finds a trigger (“@” for tabs, “/” for skills) that ends at the caret. The
 * trigger must start the draft or follow whitespace so e-mail addresses and
 * paths do not open a picker.
 */
export function findMentionQuery(value: string, caret: number, trigger: '@' | '/' = '@'): MentionQuery | undefined {
  const beforeCaret = value.slice(0, caret);
  const at = beforeCaret.lastIndexOf(trigger);
  if (at < 0) return undefined;
  if (at > 0 && !/\s/.test(beforeCaret[at - 1] ?? '')) return undefined;
  const query = beforeCaret.slice(at + 1);
  if (/\s/.test(query) || query.length > 60) return undefined;
  return { start: at, end: caret, query };
}

export function removeMentionQuery(value: string, mention: MentionQuery): { value: string; caret: number } {
  return { value: value.slice(0, mention.start) + value.slice(mention.end), caret: mention.start };
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function filterTabCandidates(candidates: TabCandidate[], query: string): TabCandidate[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return candidates;
  return candidates.filter((candidate) => (
    candidate.title.toLocaleLowerCase().includes(needle)
    || hostnameOf(candidate.url).toLocaleLowerCase().includes(needle)
  ));
}

export function isReadableTabUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.hostname === 'chromewebstore.google.com') return false;
    if (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) return false;
    return true;
  } catch {
    return false;
  }
}

/** Site access requested with “tabs” on first “@”; matches optional_host_permissions. */
export const MENTION_SITE_ORIGINS = ['http://*/*', 'https://*/*'];

export function originPatternFor(url: string): string | undefined {
  try {
    return `${new URL(url).origin}/*`;
  } catch {
    return undefined;
  }
}

/** Chrome's MV3 favicon endpoint; requires the "favicon" permission. */
export function faviconUrl(pageUrl: string, extensionOrigin: string, size = 32): string {
  const url = new URL('/_favicon/', extensionOrigin);
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.toString();
}

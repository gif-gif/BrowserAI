/** Position and size of the in-page floating chat, in CSS pixels from the viewport's top-left. */
export interface FloatingChatLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FLOATING_CHAT_MIN_WIDTH = 320;
export const FLOATING_CHAT_MIN_HEIGHT = 360;
export const FLOATING_CHAT_MAX_SIZE = 4_000;

/** Negative x / y mean “anchor to the bottom-right corner”, used until the user moves the panel. */
export const DEFAULT_FLOATING_CHAT_LAYOUT: FloatingChatLayout = { x: -1, y: -1, width: 420, height: 640 };

export function isFloatingChatLayout(value: unknown): value is FloatingChatLayout {
  if (!value || typeof value !== 'object') return false;
  const { x, y, width, height } = value as Record<string, unknown>;
  return [x, y, width, height].every((item) => typeof item === 'number' && Number.isFinite(item))
    && (width as number) >= FLOATING_CHAT_MIN_WIDTH && (width as number) <= FLOATING_CHAT_MAX_SIZE
    && (height as number) >= FLOATING_CHAT_MIN_HEIGHT && (height as number) <= FLOATING_CHAT_MAX_SIZE;
}

/** Pages a content script can draw on; Chrome blocks scripts on its own pages and the Web Store. */
export function supportsFloatingChat(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.hostname === 'chromewebstore.google.com') return false;
    return !(parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore'));
  } catch {
    return false;
  }
}

/** Extension page loaded inside the page iframe. It finds its tab with tabs.getCurrent(). */
export const FLOATING_CHAT_PAGE = '/floating.html';

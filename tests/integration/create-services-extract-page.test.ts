import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackgroundBrowserApi } from '../../core/background/browser-api';
import { createBackgroundServices } from '../../core/background/create-services';

const snapshot = {
  snapshotId: 'snapshot-1',
  tabId: 0,
  url: 'https://example.test/article',
  title: 'Article',
  text: 'Body',
  metadata: { navigationKey: 'nav-1', truncated: false },
};

function createApi(sendMessage: BackgroundBrowserApi['tabs']['sendMessage'], executeScript = vi.fn(async () => undefined)) {
  const api = {
    tabs: { sendMessage },
    scripting: { executeScript, registerContentScripts: vi.fn(), unregisterContentScripts: vi.fn() },
    permissions: { contains: vi.fn(async () => true) },
  } as unknown as BackgroundBrowserApi;
  return { api, executeScript };
}

describe('createBackgroundServices extractPage', () => {
  beforeEach(() => {
    const area = { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
    vi.stubGlobal('browser', { storage: { local: area, session: area } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('injects the content script and retries when the page has no receiver yet', async () => {
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
      .mockResolvedValueOnce(snapshot);
    const { api, executeScript } = createApi(sendMessage);

    const extracted = await createBackgroundServices(api).extractPage(7, snapshot.url, 'nav-1');

    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['content-scripts/content.js'] });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(extracted).toMatchObject({ snapshotId: 'snapshot-1', tabId: 7 });
  });

  it('reports the original failure when the script cannot be injected', async () => {
    const original = new Error('Receiving end does not exist.');
    const sendMessage = vi.fn().mockRejectedValue(original);
    const { api } = createApi(sendMessage, vi.fn(async () => { throw new Error('Cannot access contents of the page'); }));

    await expect(createBackgroundServices(api).extractPage(7, snapshot.url, 'nav-1')).rejects.toBe(original);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

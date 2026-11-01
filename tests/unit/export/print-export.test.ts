import { afterEach, describe, expect, it, vi } from 'vitest';
import { printTitle, savePrintJob, takePrintJob } from '../../../core/export/print-export';
import { STORAGE_KEYS } from '../../../shared/constants/storage-keys';

afterEach(() => vi.unstubAllGlobals());

function stubSession() {
  const store: Record<string, unknown> = {};
  const session = {
    get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(store, items); }),
    remove: vi.fn(async (key: string) => { delete store[key]; }),
  };
  vi.stubGlobal('browser', { storage: { session } });
  return { store, session };
}

describe('print export', () => {
  it('hands a job over through session storage and removes it once read', async () => {
    const { store } = stubSession();
    await savePrintJob('job-1', { title: '标题', content: '# 标题', createdAt: 1_000 });
    expect(store[`${STORAGE_KEYS.printJobPrefix}job-1`]).toBeDefined();

    expect(await takePrintJob('job-1', 2_000)).toEqual({ title: '标题', content: '# 标题', createdAt: 1_000 });
    expect(store).toEqual({});
    expect(await takePrintJob('job-1', 2_000)).toBeUndefined();
  });

  it('drops stale or damaged jobs', async () => {
    const { store } = stubSession();
    await savePrintJob('old', { title: 't', content: 'c', createdAt: 0 });
    expect(await takePrintJob('old', 11 * 60_000)).toBeUndefined();
    store[`${STORAGE_KEYS.printJobPrefix}bad`] = { title: 1 };
    expect(await takePrintJob('bad', 0)).toBeUndefined();
  });

  it('titles the PDF after the first heading or line', () => {
    expect(printTitle('\n## **季度** 回顾\n正文', 'Browser AI')).toBe('季度 回顾');
    expect(printTitle('   ', 'Browser AI')).toBe('Browser AI');
  });
});

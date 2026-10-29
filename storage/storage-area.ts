export interface StorageArea {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export class ChromeLocalStorageArea implements StorageArea {
  async get<T>(key: string): Promise<T | undefined> {
    const value = await browser.storage.local.get(key);
    return value[key] as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  }
  async remove(key: string): Promise<void> {
    await browser.storage.local.remove(key);
  }
}

/** chrome.storage.session survives service-worker restarts but not a browser restart. */
export class ChromeSessionStorageArea implements StorageArea {
  async get<T>(key: string): Promise<T | undefined> {
    const value = await browser.storage.session.get(key);
    return value[key] as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    await browser.storage.session.set({ [key]: value });
  }
  async remove(key: string): Promise<void> {
    await browser.storage.session.remove(key);
  }
}

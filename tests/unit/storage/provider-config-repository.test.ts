import { describe, expect, it } from 'vitest';
import { ProviderConfigRepository } from '../../../storage/provider-config-repository';
import { FakeStorageArea } from '../../setup/fake-storage';

const draft = { id: 'p1', name: 'Gateway', type: 'openai-compatible' as const, baseURL: 'https://gw.test/v1', model: 'gpt-test', endpointMode: 'chat-completions' as const, defaultHeaders: {}, timeoutMs: 30_000, stream: true as const };

describe('ProviderConfigRepository', () => {
  it('stores provider metadata and secret separately', async () => {
    const storage = new FakeStorageArea();
    const repo = new ProviderConfigRepository(storage, () => 100);
    await repo.save(draft, 'secret');
    const snapshot = storage.snapshot();
    expect(JSON.stringify(snapshot)).not.toContain('apiKey":"secret');
    expect(Object.keys(snapshot)).toContain('chromeAi:v1:providerSecrets:p1');
    expect(await repo.get('p1')).not.toHaveProperty('apiKey');
    expect(await repo.getSecretForBackground('p1')).toBe('secret');
  });

  it('preserves an existing key when save receives an empty key', async () => {
    const repo = new ProviderConfigRepository(new FakeStorageArea(), () => 100);
    await repo.save(draft, 'secret');
    await repo.save({ ...draft, name: 'Renamed' }, '');
    expect(await repo.getSecretForBackground('p1')).toBe('secret');
  });

  it('removes only the selected provider key', async () => {
    const repo = new ProviderConfigRepository(new FakeStorageArea(), () => 100);
    await repo.save(draft, 'secret');
    await repo.save({ ...draft, id: 'p2' }, 'other');
    await repo.removeSecret('p1');
    expect(await repo.getSecretForBackground('p1')).toBeUndefined();
    expect(await repo.getSecretForBackground('p2')).toBe('other');
  });

  it('returns the one Gateway from settings as the active config', async () => {
    const repo = new ProviderConfigRepository(new FakeStorageArea(), () => 100);
    expect(await repo.getActive()).toBeUndefined();
    await repo.save(draft, 'secret');
    await repo.save({ ...draft, model: 'gpt-next' });
    expect(await repo.list()).toHaveLength(1);
    expect(await repo.getActive()).toMatchObject({ id: 'p1', model: 'gpt-next' });
  });
});

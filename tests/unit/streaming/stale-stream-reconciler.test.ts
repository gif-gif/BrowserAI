import { expect, it } from 'vitest';
import { reconcileStaleStreams } from '../../../core/streaming/stale-stream-reconciler';
import { ConversationRepository } from '../../../storage/conversation-repository';
import { FakeStorageArea } from '../../setup/fake-storage';

it('marks old streaming messages as interrupted after worker restart', async () => {
  const repository = new ConversationRepository(new FakeStorageArea());
  await repository.save({ id: 'c1', title: 'c', providerId: 'p', model: 'm', promptVersion: 'v1', pinned: false, createdAt: 1, updatedAt: 1, messages: [{ id: 'a1', role: 'assistant', content: 'partial', status: 'streaming', createdAt: 100 }] });
  expect(await reconcileStaleStreams(repository, { now: 1000, thresholdMs: 500 })).toBe(1);
  expect((await repository.get('c1'))?.messages[0]).toMatchObject({ status: 'failed', error: { code: 'STREAM_INTERRUPTED' } });
});

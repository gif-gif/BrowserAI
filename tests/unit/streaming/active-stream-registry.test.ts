import { describe, expect, it } from 'vitest';
import { ActiveStreamRegistry } from '../../../core/streaming/active-stream-registry';

describe('ActiveStreamRegistry', () => {
  it('isolates streams by request id and aborts only the requested stream', () => {
    const registry = new ActiveStreamRegistry();
    const first = new AbortController();
    const second = new AbortController();
    registry.register({ requestId: 'r1', conversationId: 'c1', assistantMessageId: 'a1', controller: first });
    registry.register({ requestId: 'r2', conversationId: 'c2', assistantMessageId: 'a2', controller: second });
    expect(registry.cancel('r1')).toMatchObject({ requestId: 'r1', assistantMessageId: 'a1' });
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(registry.get('r2')).toBeDefined();
  });

  it('rejects duplicate active request ids', () => {
    const registry = new ActiveStreamRegistry();
    const entry = { requestId: 'r1', conversationId: 'c1', assistantMessageId: 'a1', controller: new AbortController() };
    registry.register(entry);
    expect(() => registry.register(entry)).toThrowError(expect.objectContaining({ code: 'INVALID_MESSAGE' }));
  });
});

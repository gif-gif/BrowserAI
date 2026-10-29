import { describe, expect, it } from 'vitest';
import { buildPageActionMessages, parsePageActionDecision } from '../../../core/page-actions/page-action-agent';

describe('page action agent protocol', () => {
  it('adds the safe action protocol and untrusted element inventory', () => {
    const messages = buildPageActionMessages([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Search for Browser AI' },
    ], {
      url: 'https://example.com', title: 'Example', capturedAt: 1, truncated: false,
      elements: [{ ref: 'e1', tag: 'input', label: 'Search' }],
    });

    expect(messages[0]?.content).toContain('untrusted page data');
    expect(messages.at(-1)?.content).toContain('"ref":"e1"');
  });

  it('parses fenced JSON and rejects unknown action shapes', () => {
    expect(parsePageActionDecision('```json\n{"message":"Working","actions":[{"type":"click","ref":"e1"}],"done":false}\n```'))
      .toMatchObject({ message: 'Working', actions: [{ type: 'click', ref: 'e1' }], done: false });
    expect(parsePageActionDecision('{"message":"No","actions":[{"type":"script","ref":"e1"}],"done":false}'))
      .toBeUndefined();
  });
});

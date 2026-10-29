import { describe, expect, it } from 'vitest';
import { redactText } from '../../../shared/redaction/redact';

describe('redactText', () => {
  it('redacts bearer tokens and registered secrets', () => {
    const value = redactText('Authorization: Bearer abc123; key=private-key', ['private-key']);
    expect(value).not.toContain('abc123');
    expect(value).not.toContain('private-key');
    expect(value).toContain('[REDACTED]');
  });
});

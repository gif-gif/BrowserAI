import { describe, expect, it } from 'vitest';
import { sanitizeCustomHeaders } from '../../../shared/redaction/header-policy';

describe('sanitizeCustomHeaders', () => {
  it('blocks protected header names case-insensitively', () => {
    expect(() => sanitizeCustomHeaders({ authorization: 'secret' })).toThrow(/authorization/i);
    expect(() => sanitizeCustomHeaders({ 'Content-Type': 'text/plain' })).toThrow(/content-type/i);
  });

  it('trims allowed header keys and values', () => {
    expect(sanitizeCustomHeaders({ ' X-Tenant ': ' team-a ' })).toEqual({ 'X-Tenant': 'team-a' });
  });
});

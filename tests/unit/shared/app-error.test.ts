import { describe, expect, it } from 'vitest';
import { AppError, normalizeError, serializeAppError } from '../../../shared/errors/app-error';

describe('AppError', () => {
  it('serializes only safe fields', () => {
    const error = new AppError('AUTHENTICATION_FAILED', '认证失败', {
      retryable: false,
      status: 401,
      requestId: 'req-1',
      cause: new Error('Bearer super-secret'),
    });
    expect(serializeAppError(error)).toEqual({
      code: 'AUTHENTICATION_FAILED', message: '认证失败', retryable: false, status: 401, requestId: 'req-1',
    });
  });

  it('normalizes unknown thrown values', () => {
    expect(normalizeError({ broken: true })).toMatchObject({ code: 'UNKNOWN', retryable: false });
  });
});

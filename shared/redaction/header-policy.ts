import { AppError } from '../errors/app-error';

const BLOCKED_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'content-type',
  'host',
  'content-length',
  'origin',
]);

export function sanitizeCustomHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    const key = rawKey.trim();
    const value = rawValue.trim();
    if (!key || !value) continue;
    if (BLOCKED_HEADERS.has(key.toLowerCase())) {
      throw new AppError('CONFIG_MISSING', `不允许覆盖请求头：${key}`);
    }
    result[key] = value;
  }
  return result;
}

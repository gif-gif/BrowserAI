import { AppError } from '../../shared/errors/app-error';
import type { GatewayOriginAnalysis, GatewayTransport } from '../../shared/types/permissions';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function analyzeGatewayBaseUrl(rawBaseURL: string): GatewayOriginAnalysis {
  let url: URL;
  try {
    url = new URL(rawBaseURL.trim());
  } catch (cause) {
    throw new AppError('INVALID_BASE_URL', 'Gateway Base URL 无效', { cause });
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AppError('INVALID_BASE_URL', 'Gateway 仅支持 HTTP 或 HTTPS');
  }
  if (url.username || url.password) {
    throw new AppError('INVALID_BASE_URL', 'Gateway URL 不能包含用户名或密码');
  }
  if (url.hash) {
    throw new AppError('INVALID_BASE_URL', 'Gateway URL 不能包含片段标识');
  }

  const transport: GatewayTransport = url.protocol === 'https:'
    ? 'secure'
    : LOCAL_HOSTNAMES.has(url.hostname)
      ? 'insecure-local'
      : 'insecure-remote';

  return {
    baseURL: url.toString(),
    origin: url.origin,
    originPattern: `${url.origin}/*`,
    transport,
    requiresWarningAcknowledgement: transport !== 'secure',
  };
}

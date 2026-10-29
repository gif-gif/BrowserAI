import { AppError } from '../../shared/errors/app-error';

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  requestID?: unknown;
  requestId?: unknown;
}

function details(error: unknown): ErrorLike {
  return error && typeof error === 'object' ? error as ErrorLike : {};
}

export function mapOpenAIError(error: unknown, signal?: AbortSignal): AppError {
  if (error instanceof AppError) return error;
  const value = details(error);
  const name = typeof value.name === 'string' ? value.name : '';
  const message = typeof value.message === 'string' ? value.message : '';
  const status = typeof value.status === 'number' ? value.status : undefined;
  const requestId = typeof value.requestID === 'string'
    ? value.requestID
    : typeof value.requestId === 'string'
      ? value.requestId
      : undefined;

  if (signal?.aborted || name === 'AbortError' || name === 'APIUserAbortError') {
    return new AppError('REQUEST_CANCELLED', '请求已取消', { requestId, cause: error });
  }
  if (name === 'APIConnectionTimeoutError' || /timed?\s*out|timeout/i.test(message)) {
    return new AppError('REQUEST_TIMEOUT', 'Gateway 请求超时', { retryable: true, requestId, cause: error });
  }
  if (status === 401 || status === 403) {
    return new AppError('AUTHENTICATION_FAILED', 'Gateway 身份验证失败，请检查 API Key', {
      status,
      requestId,
      cause: error,
    });
  }
  if (status === 404 && /model|模型|does not exist|not found/i.test(message)) {
    return new AppError('MODEL_NOT_FOUND', 'Gateway 未找到配置的模型', {
      status,
      requestId,
      cause: error,
    });
  }
  if (status === 429) {
    return new AppError('RATE_LIMITED', 'Gateway 请求过于频繁，请稍后重试', {
      status,
      retryable: true,
      requestId,
      cause: error,
    });
  }
  if (status === undefined || status >= 500) {
    return new AppError('GATEWAY_UNAVAILABLE', 'Gateway 暂时不可用', {
      status,
      retryable: true,
      requestId,
      cause: error,
    });
  }
  return new AppError('UNKNOWN', 'Gateway 请求失败', { status, requestId, cause: error });
}

export type AppErrorCode =
  | 'CONFIG_MISSING'
  | 'API_KEY_MISSING'
  | 'INVALID_BASE_URL'
  | 'INVALID_MESSAGE'
  | 'HOST_PERMISSION_REQUIRED'
  | 'PAGE_PERMISSION_REQUIRED'
  | 'PAGE_UNSUPPORTED'
  | 'CONTEXT_EXTRACTION_FAILED'
  | 'CONTEXT_STALE'
  | 'PAGE_ACTION_FAILED'
  | 'MODEL_NOT_FOUND'
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'GATEWAY_UNAVAILABLE'
  | 'REQUEST_TIMEOUT'
  | 'REQUEST_CANCELLED'
  | 'STREAM_PROTOCOL_ERROR'
  | 'STREAM_INTERRUPTED'
  | 'WRITING_ASSISTANT_UNCHANGED'
  | 'WRITING_ASSISTANT_REQUIREMENTS_NOT_MET'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'UNKNOWN';

export interface SerializedAppError {
  code: AppErrorCode;
  message: string;
  retryable: boolean;
  status?: number;
  requestId?: string;
}

interface AppErrorOptions {
  retryable?: boolean;
  status?: number;
  requestId?: string;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly requestId?: string;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.requestId = options.requestId;
  }
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    return new AppError('UNKNOWN', error.message || '发生未知错误', { cause: error });
  }
  return new AppError('UNKNOWN', '发生未知错误', { cause: error });
}

export function serializeAppError(error: unknown): SerializedAppError {
  const normalized = normalizeError(error);
  return {
    code: normalized.code,
    message: normalized.message,
    retryable: normalized.retryable,
    ...(normalized.status === undefined ? {} : { status: normalized.status }),
    ...(normalized.requestId === undefined ? {} : { requestId: normalized.requestId }),
  };
}

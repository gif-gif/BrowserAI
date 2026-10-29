export interface CapturedClientOptions {
  apiKey: string;
  baseURL: string;
  defaultHeaders?: Record<string, string>;
  dangerouslyAllowBrowser?: boolean;
  timeout?: number;
  maxRetries?: number;
}

export interface CapturedChatRequest {
  body: Record<string, unknown>;
  options?: { signal?: AbortSignal };
}

export interface CapturedImageRequest {
  body: Record<string, unknown>;
  options?: { signal?: AbortSignal; timeout?: number };
}

export interface FakeGatewayResponse {
  chunks?: readonly unknown[];
  error?: unknown;
  delayMs?: number;
  waitForAbort?: boolean;
}

export interface FakeGatewayOptions {
  models?: readonly string[];
  modelError?: unknown;
  imageResponse?: unknown;
  imageError?: unknown;
}

function abortError(): Error {
  return Object.assign(new Error('The request was aborted'), { name: 'AbortError' });
}

function waitForAbort(signal?: AbortSignal): Promise<never> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(abortError()), { once: true });
  });
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

export function loadOpenAIJsonlFixture(source: string): unknown[] {
  return source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

export function createFakeOpenAIClientFactory(
  chunksOrResponses: readonly unknown[] | readonly FakeGatewayResponse[],
  options: FakeGatewayOptions = {},
) {
  const looksLikeResponseQueue = chunksOrResponses.some((item) =>
    Boolean(item && typeof item === 'object' && (
      'chunks' in item || 'error' in item || 'delayMs' in item || 'waitForAbort' in item
    )));
  const responses: FakeGatewayResponse[] = looksLikeResponseQueue
    ? [...chunksOrResponses] as FakeGatewayResponse[]
    : [{ chunks: chunksOrResponses }];
  const clientOptions: CapturedClientOptions[] = [];
  const requests: CapturedChatRequest[] = [];
  const imageRequests: CapturedImageRequest[] = [];
  let modelListRequests = 0;
  const requestWaiters = new Set<() => void>();

  const notifyRequest = () => {
    for (const waiter of requestWaiters) waiter();
    requestWaiters.clear();
  };

  const factory = (clientConfig: CapturedClientOptions) => {
    clientOptions.push(clientConfig);
    return {
      models: {
        list: async () => {
          modelListRequests += 1;
          if (options.modelError) throw options.modelError;
          return (async function* () {
            for (const id of options.models ?? []) yield { id };
          })();
        },
      },
      images: {
        generate: async (
          body: Record<string, unknown>,
          requestOptions?: { signal?: AbortSignal; timeout?: number },
        ) => {
          imageRequests.push({ body, options: requestOptions });
          if (options.imageError) throw options.imageError;
          if (requestOptions?.signal?.aborted) throw abortError();
          return structuredClone(options.imageResponse ?? { data: [] });
        },
      },
      chat: {
        completions: {
          create: async (body: Record<string, unknown>, requestOptions?: { signal?: AbortSignal }) => {
            requests.push({ body, options: requestOptions });
            notifyRequest();
            const response = responses.shift() ?? { chunks: [] };
            if (response.error) throw response.error;
            return (async function* () {
              if (response.waitForAbort) await waitForAbort(requestOptions?.signal);
              for (const chunk of response.chunks ?? []) {
                await delay(response.delayMs ?? 0, requestOptions?.signal);
                if (requestOptions?.signal?.aborted) throw abortError();
                yield structuredClone(chunk);
              }
            })();
          },
        },
      },
    };
  };

  const waitForRequestCount = async (count: number): Promise<void> => {
    while (requests.length < count) {
      await new Promise<void>((resolve) => requestWaiters.add(resolve));
    }
  };

  return {
    factory,
    clientOptions,
    requests,
    imageRequests,
    get modelListRequests() { return modelListRequests; },
    waitForRequestCount,
  };
}

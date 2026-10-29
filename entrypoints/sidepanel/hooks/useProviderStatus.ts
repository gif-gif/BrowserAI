import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RuntimeCommand } from '../../../messaging/contracts';
import { normalizeError, type AppError } from '../../../shared/errors/app-error';
import type { ProviderConfig } from '../../../shared/types/provider';

interface RuntimeSender {
  send(command: RuntimeCommand): Promise<unknown>;
}

interface ProviderSettingsResult {
  providers?: Array<{
    config?: ProviderConfig;
    hasApiKey?: boolean;
  }>;
}

interface ProviderStatus {
  loading: boolean;
  ready: boolean;
  config?: ProviderConfig;
  models: string[];
  modelsLoading: boolean;
  modelsError?: AppError;
  error?: AppError;
  refresh(): Promise<void>;
  refreshModels(): Promise<string[]>;
}

function defaultRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `provider-status-${Date.now()}`;
}

export function useProviderStatus(
  runtime: RuntimeSender,
  createRequestId: () => string = defaultRequestId,
): ProviderStatus {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<ProviderConfig>();
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<AppError>();
  const [error, setError] = useState<AppError>();
  const runtimeRef = useRef(runtime);
  const requestIdRef = useRef(createRequestId);
  const generationRef = useRef(0);

  runtimeRef.current = runtime;
  requestIdRef.current = createRequestId;

  const refreshModelsFor = useCallback(async (nextConfig: ProviderConfig) => {
    setModelsLoading(true);
    setModelsError(undefined);
    try {
      const result = await runtimeRef.current.send({
        version: 1,
        requestId: requestIdRef.current(),
        type: 'LIST_PROVIDER_MODELS',
        config: {
          id: nextConfig.id,
          name: nextConfig.name,
          type: nextConfig.type,
          baseURL: nextConfig.baseURL,
          model: nextConfig.model,
          endpointMode: nextConfig.endpointMode,
          defaultHeaders: nextConfig.defaultHeaders,
          ...(nextConfig.temperature === undefined ? {} : { temperature: nextConfig.temperature }),
          ...(nextConfig.maxOutputTokens === undefined ? {} : { maxOutputTokens: nextConfig.maxOutputTokens }),
          timeoutMs: nextConfig.timeoutMs,
          stream: nextConfig.stream,
        },
      }) as { models?: string[] };
      const values = Array.from(new Set([
        nextConfig.model,
        ...(result.models ?? []),
      ].map((model) => model.trim()).filter(Boolean)));
      setModels(values);
      return values;
    } catch (caught) {
      const normalized = normalizeError(caught);
      setModelsError(normalized);
      const fallback = nextConfig.model ? [nextConfig.model] : [];
      setModels(fallback);
      return fallback;
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const generation = ++generationRef.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await runtimeRef.current.send({
        version: 1,
        requestId: requestIdRef.current(),
        type: 'GET_PROVIDER_SETTINGS',
      }) as ProviderSettingsResult;
      if (generation !== generationRef.current) return;
      const configured = result.providers?.find((provider) => provider.hasApiKey && provider.config?.id);
      const nextConfig = configured?.config;
      setReady(Boolean(nextConfig));
      setConfig(nextConfig);
      setModels(nextConfig?.model ? [nextConfig.model] : []);
      if (nextConfig) void refreshModelsFor(nextConfig);
    } catch (caught) {
      if (generation !== generationRef.current) return;
      setReady(false);
      setConfig(undefined);
      setModels([]);
      setError(normalizeError(caught));
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [refreshModelsFor]);

  const refreshModels = useCallback(async () => {
    if (!config) return [];
    return refreshModelsFor(config);
  }, [config, refreshModelsFor]);

  useEffect(() => { void refresh(); }, [refresh]);

  return useMemo(() => ({
    loading,
    ready,
    config,
    models,
    modelsLoading,
    modelsError,
    error,
    refresh,
    refreshModels,
  }), [config, error, loading, models, modelsError, modelsLoading, ready, refresh, refreshModels]);
}

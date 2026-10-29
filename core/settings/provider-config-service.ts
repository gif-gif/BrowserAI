import type { RuntimeCommand } from '../../messaging/contracts';
import type {
  ConnectionTestResult,
  ProviderConfig,
  ProviderConfigSubmission,
  ProviderModelListResult,
} from '../../shared/types/provider';

interface RuntimeSender {
  send(command: RuntimeCommand): Promise<unknown>;
}

export interface ProviderSettingsItem {
  config: ProviderConfig;
  hasApiKey: boolean;
}

export interface ProviderSettingsSnapshot {
  providers: ProviderSettingsItem[];
}

export interface SaveProviderResult {
  config: ProviderConfig;
  hasApiKey: boolean;
}

function requestId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomId}`;
}

export class ProviderConfigService {
  constructor(private readonly runtime: RuntimeSender) {}

  async load(): Promise<ProviderSettingsSnapshot> {
    return this.runtime.send({
      version: 1,
      type: 'GET_PROVIDER_SETTINGS',
      requestId: requestId('provider-settings'),
    }) as Promise<ProviderSettingsSnapshot>;
  }

  async save(submission: ProviderConfigSubmission): Promise<SaveProviderResult> {
    return this.runtime.send({
      version: 1,
      type: 'SAVE_PROVIDER_CONFIG',
      requestId: requestId('provider-save'),
      config: submission.config,
      ...(submission.apiKey === undefined ? {} : { apiKey: submission.apiKey }),
    }) as Promise<SaveProviderResult>;
  }

  async listModels(submission: ProviderConfigSubmission): Promise<string[]> {
    const result = await this.runtime.send({
      version: 1,
      type: 'LIST_PROVIDER_MODELS',
      requestId: requestId('provider-models'),
      config: submission.config,
      ...(submission.apiKey === undefined ? {} : { apiKey: submission.apiKey }),
    }) as ProviderModelListResult;
    return result.models;
  }

  async testDraft(submission: ProviderConfigSubmission): Promise<ConnectionTestResult> {
    return this.runtime.send({
      version: 1,
      type: 'TEST_PROVIDER_DRAFT',
      requestId: requestId('provider-test'),
      config: submission.config,
      ...(submission.apiKey === undefined ? {} : { apiKey: submission.apiKey }),
    }) as Promise<ConnectionTestResult>;
  }

  async removeSecret(providerId: string): Promise<void> {
    await this.runtime.send({
      version: 1,
      type: 'REMOVE_PROVIDER_SECRET',
      requestId: requestId('provider-secret-remove'),
      providerId,
    });
  }
}

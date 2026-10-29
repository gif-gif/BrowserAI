import { AppError } from '../../shared/errors/app-error';
import type { ProviderType } from '../../shared/types/provider';
import type { ProviderAdapter } from './provider-adapter';

export class ProviderRegistry {
  private readonly adapters = new Map<ProviderType, ProviderAdapter>();

  constructor(adapters: ProviderAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  get(type: ProviderType): ProviderAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) throw new AppError('CONFIG_MISSING', `尚未注册 Provider Adapter：${type}`);
    return adapter;
  }
}

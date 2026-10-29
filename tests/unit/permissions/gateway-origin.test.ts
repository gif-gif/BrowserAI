import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../shared/errors/app-error';
import { analyzeGatewayBaseUrl } from '../../../core/permissions/gateway-origin';
import { GatewayPermissionService } from '../../../core/permissions/gateway-permission-service';

function permissions(granted = true) {
  return {
    contains: vi.fn(async () => false),
    request: vi.fn(async () => granted),
    remove: vi.fn(async () => true),
  };
}

describe('analyzeGatewayBaseUrl', () => {
  it('normalizes a path URL to an exact origin match pattern', () => {
    expect(analyzeGatewayBaseUrl('https://gateway.example.com/v1').originPattern)
      .toBe('https://gateway.example.com/*');
  });

  it.each([
    'https://user:pass@gateway.example.com/v1',
    'https://gateway.example.com/v1#secret',
    'ftp://gateway.example.com/v1',
  ])('rejects unsafe base URL %s', (baseURL) => {
    expect(() => analyzeGatewayBaseUrl(baseURL)).toThrow(AppError);
  });

  it('accepts HTTP localhost with an insecure transport warning', () => {
    expect(analyzeGatewayBaseUrl('http://localhost:8787/v1')).toMatchObject({
      originPattern: 'http://localhost:8787/*',
      transport: 'insecure-local',
      requiresWarningAcknowledgement: true,
    });
  });

  it('requires explicit warning acknowledgement before requesting other HTTP origins', async () => {
    const api = permissions();
    const service = new GatewayPermissionService(api);
    const warning = await service.requestForBaseUrl('http://gateway.example.com/v1');
    expect(warning).toMatchObject({ state: 'warning-required', granted: false });
    expect(api.request).not.toHaveBeenCalled();

    const result = await service.requestForBaseUrl('http://gateway.example.com/v1', {
      acknowledgeInsecureTransport: true,
    });
    expect(result).toMatchObject({ state: 'granted', granted: true });
    expect(api.request).toHaveBeenCalledWith({ origins: ['http://gateway.example.com/*'] });
  });
});

describe('GatewayPermissionService', () => {
  it('requests only the configured Gateway origin without an asynchronous preflight', async () => {
    const api = permissions();
    await new GatewayPermissionService(api).requestForBaseUrl('https://gateway.example.com/v1');
    expect(api.contains).not.toHaveBeenCalled();
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request).toHaveBeenCalledWith({ origins: ['https://gateway.example.com/*'] });
  });

  it('does not revoke an origin still used by another provider', async () => {
    const api = permissions();
    const service = new GatewayPermissionService(api);
    const result = await service.removeForBaseUrlIfUnused('https://gateway.example.com/v1', [
      'https://gateway.example.com/compatible/v1',
      'https://another.example.com/v1',
    ]);
    expect(result).toEqual({ removed: false, reason: 'in-use' });
    expect(api.remove).not.toHaveBeenCalled();
  });
});

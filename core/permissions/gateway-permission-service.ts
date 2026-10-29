import type { GatewayPermissionResult, OriginPermissionsApi } from '../../shared/types/permissions';
import { analyzeGatewayBaseUrl } from './gateway-origin';

export class GatewayPermissionService {
  constructor(private readonly permissions: OriginPermissionsApi) {}

  async requestForBaseUrl(
    baseURL: string,
    options: { acknowledgeInsecureTransport?: boolean } = {},
  ): Promise<GatewayPermissionResult> {
    const analysis = analyzeGatewayBaseUrl(baseURL);
    if (analysis.requiresWarningAcknowledgement && !options.acknowledgeInsecureTransport) {
      return { ...analysis, state: 'warning-required', granted: false };
    }

    // permissions.request must be the first asynchronous browser API call in the
    // click/submit handler so Chrome still considers it part of the user gesture.
    // It also returns true when the origin was already granted, so a preceding
    // permissions.contains() check is unnecessary and would consume the gesture.
    const granted = await this.permissions.request({ origins: [analysis.originPattern] });
    return { ...analysis, state: granted ? 'granted' : 'denied', granted };
  }

  async removeForBaseUrlIfUnused(
    baseURL: string,
    remainingProviderBaseURLs: string[],
  ): Promise<{ removed: boolean; reason: 'in-use' | 'removed' | 'not-granted' }> {
    const originPattern = analyzeGatewayBaseUrl(baseURL).originPattern;
    const stillInUse = remainingProviderBaseURLs.some((candidate) => {
      try {
        return analyzeGatewayBaseUrl(candidate).originPattern === originPattern;
      } catch {
        return false;
      }
    });
    if (stillInUse) return { removed: false, reason: 'in-use' };

    const removed = await this.permissions.remove({ origins: [originPattern] });
    return { removed, reason: removed ? 'removed' : 'not-granted' };
  }
}

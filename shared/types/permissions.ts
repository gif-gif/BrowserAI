export type GatewayTransport = 'secure' | 'insecure-local' | 'insecure-remote';

export interface GatewayOriginAnalysis {
  baseURL: string;
  origin: string;
  originPattern: string;
  transport: GatewayTransport;
  requiresWarningAcknowledgement: boolean;
}

export type GatewayPermissionState =
  | 'granted'
  | 'already-granted'
  | 'denied'
  | 'warning-required';

export interface GatewayPermissionResult extends GatewayOriginAnalysis {
  state: GatewayPermissionState;
  granted: boolean;
}

export interface OriginPermissionsApi {
  contains(permissions: { origins: string[] }): Promise<boolean>;
  request(permissions: { origins: string[] }): Promise<boolean>;
  remove(permissions: { origins: string[] }): Promise<boolean>;
}

export interface DynamicContentScript {
  id: string;
  matches: string[];
  js: string[];
  runAt?: 'document_start' | 'document_end' | 'document_idle';
  persistAcrossSessions?: boolean;
}

export interface DynamicScriptingApi {
  getRegisteredContentScripts?(): Promise<Array<{ id: string }>>;
  registerContentScripts(scripts: DynamicContentScript[]): Promise<void>;
  unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
}

export type PageAccessReason = 'restricted' | 'denylisted';

export interface PageAccessPolicy {
  supported: boolean;
  excluded: boolean;
  automatic: boolean;
  selectionActionEnabled: boolean;
  pageContextAllowed: boolean;
  canAllowOnce: boolean;
  reason?: PageAccessReason;
}

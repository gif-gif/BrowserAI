const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Treat model-produced URLs as untrusted. The MVP only opens absolute web URLs;
 * extension, script, data, file, credential-bearing, and relative URLs are blocked.
 */
export function toSafeExternalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (!SAFE_EXTERNAL_PROTOCOLS.has(url.protocol)) return undefined;
    if (url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function safeMarkdownUrlTransform(value: string): string {
  return toSafeExternalUrl(value) ?? '';
}

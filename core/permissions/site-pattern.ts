const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function isIpAddress(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

function isValidHostname(hostname: string): boolean {
  if (!hostname || hostname.length > 253) return false;
  if (hostname === 'localhost') return true;
  if (isIpAddress(hostname)) {
    try {
      const parsed = new URL(`http://${hostname}`);
      return parsed.hostname.toLowerCase() === hostname.toLowerCase();
    } catch {
      return false;
    }
  }
  return hostname.split('.').every((label) => HOST_LABEL.test(label));
}

/**
 * Converts a user-entered HTTP(S) URL or hostname into a denylist hostname.
 * Wildcards are deliberately limited to a leading `*.` so exclusions cannot
 * accidentally expand beyond a site's subdomains.
 */
export function normalizeSitePattern(input: string): string | undefined {
  const value = input.trim().toLowerCase();
  if (!value) return undefined;

  const wildcard = value.startsWith('*.');
  const candidate = wildcard ? value.slice(2) : value;
  let hostname: string;

  if (/^[a-z][a-z\d+.-]*:/i.test(candidate)) {
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    if (parsed.username || parsed.password) return undefined;
    hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  } else {
    if (candidate.includes('/') || candidate.includes('?') || candidate.includes('#') || candidate.includes('@')) {
      return undefined;
    }
    // A port is not part of a site exclusion. Bracketed IPv6 literals are
    // accepted by URL parsing, while arbitrary colon syntax is rejected.
    try {
      const parsed = new URL(`http://${candidate}`);
      if (parsed.port || parsed.pathname !== '/') return undefined;
      hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    } catch {
      return undefined;
    }
  }

  if (!isValidHostname(hostname)) return undefined;
  if (wildcard && (isIpAddress(hostname) || hostname === 'localhost')) return undefined;
  return wildcard ? `*.${hostname}` : hostname;
}

export function matchesSitePattern(url: string, pattern: string): boolean {
  const normalized = normalizeSitePattern(pattern);
  if (!normalized) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!normalized.startsWith('*.')) return hostname === normalized;
  const parent = normalized.slice(2);
  return hostname !== parent && hostname.endsWith(`.${parent}`);
}

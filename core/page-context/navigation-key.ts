/**
 * Produces a key that changes for URL changes and can also be advanced for
 * same-URL application navigations.
 */
export function createNavigationKey(url: string, revision = 0): string {
  return `${url}#chrome-ai-navigation-${revision}`;
}

/** Whether a key produced by createNavigationKey belongs to this URL, at any revision. */
export function isNavigationKeyFor(navigationKey: string, url: string): boolean {
  const prefix = `${url}#chrome-ai-navigation-`;
  return navigationKey.startsWith(prefix) && /^\d+$/u.test(navigationKey.slice(prefix.length));
}

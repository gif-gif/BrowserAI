/**
 * Produces a key that changes for URL changes and can also be advanced for
 * same-URL application navigations.
 */
export function createNavigationKey(url: string, revision = 0): string {
  return `${url}#chrome-ai-navigation-${revision}`;
}

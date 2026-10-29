export const STORAGE_KEYS = {
  providerConfigs: 'chromeAi:v1:providerConfigs',
  providerSecretsPrefix: 'chromeAi:v1:providerSecrets:',
  conversations: 'chromeAi:v1:conversations',
  tabBindings: 'chromeAi:v1:tabBindings',
  preferences: 'chromeAi:v1:preferences',
  languagePreference: 'chromeAi:v1:languagePreference',
  themePreference: 'chromeAi:v1:themePreference',
  appearancePreference: 'chromeAi:v1:appearancePreference',
  writingAssistantEnabled: 'chromeAi:v1:writingAssistantEnabled',
  skills: 'chromeAi:v1:skills',
  newChatShortcuts: 'chromeAi:v1:newChatShortcuts',
  floatingChatLayout: 'chromeAi:v1:floatingChatLayout',
  /** chrome.storage.session: tabs showing the in-page floating chat; cleared when Chrome restarts. */
  floatingChatTabs: 'chromeAi:v1:floatingChatTabs',
  migrations: 'chromeAi:v1:migrations',
} as const;

export function providerSecretKey(providerId: string): string {
  return `${STORAGE_KEYS.providerSecretsPrefix}${providerId}`;
}

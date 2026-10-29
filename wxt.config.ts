import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    default_locale: 'en',
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    minimum_chrome_version: '114',
    permissions: [
      'activeTab',
      'scripting',
      'storage',
      'sidePanel',
      'contextMenus',
      'alarms',
      'unlimitedStorage',
      // Shows site icons for tabs shared with “@” via chrome-extension://<id>/_favicon/.
      'favicon',
    ],
    // Requested once, together with all-site access, on first “@” use to list
    // and read other tabs in the current window.
    optional_permissions: ['tabs'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: { default_title: '__MSG_actionTitle__' },
    // The content script frames this page to show the floating chat inside the current web page.
    // floating.html renders nothing unless the user opened the floating chat in that tab.
    web_accessible_resources: [{ resources: ['floating.html'], matches: ['http://*/*', 'https://*/*'] }],
  },
});

import { getMessages } from '../../shared/i18n/locale';
import type { BackgroundTab, ContextMenusApi } from './browser-api';

export const CONTEXT_MENU_IDS = {
  ask: 'chrome-ai-ask-selection', summarize: 'chrome-ai-summarize-selection', translate: 'chrome-ai-translate-selection', explain: 'chrome-ai-explain-selection',
} as const;

type MenuId = (typeof CONTEXT_MENU_IDS)[keyof typeof CONTEXT_MENU_IDS];

interface ContextMenuDependencies {
  openPanel(tab: BackgroundTab): Promise<void>;
  resolveTab(tab: BackgroundTab): Promise<unknown>;
  attachSelection(tabId: number, text: string): void;
}

function menuTitles(): Record<MenuId, string> {
  const messages = getMessages();
  return {
    [CONTEXT_MENU_IDS.ask]: messages.selectionAsk,
    [CONTEXT_MENU_IDS.summarize]: messages.contextMenuSummarize,
    [CONTEXT_MENU_IDS.translate]: messages.contextMenuTranslate,
    [CONTEXT_MENU_IDS.explain]: messages.contextMenuExplain,
  };
}

function isKnownMenuId(value: string | number, titles: Record<MenuId, string>): value is MenuId {
  return typeof value === 'string' && value in titles;
}

export function registerContextMenus(menus: ContextMenusApi, dependencies: ContextMenuDependencies): { ready: Promise<void>; dispose(): void } {
  const titles = menuTitles();
  const ready = Promise.resolve(menus.removeAll()).then(() => {
    for (const [id, title] of Object.entries(titles)) menus.create({ id, title, contexts: ['selection'] });
  });
  const onClicked = (info: { menuItemId: string | number; selectionText?: string }, tab?: BackgroundTab) => {
    const tabId = tab?.id;
    const text = info.selectionText?.trim();
    if (!isKnownMenuId(info.menuItemId, titles) || tabId === undefined || !text || !tab?.url) return;
    dependencies.attachSelection(tabId, text);
    const opening = dependencies.openPanel(tab);
    void Promise.allSettled([opening, dependencies.resolveTab(tab)]);
  };
  menus.onClicked.addListener(onClicked);
  return { ready, dispose() { menus.onClicked.removeListener(onClicked); } };
}

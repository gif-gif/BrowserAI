import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { useTheme } from '../../shared/theme/ThemeProvider';
import type { AppearancePreference } from '../../shared/theme/appearance';
import { THEMES } from '../../shared/theme/theme';
interface PanelHeaderProps {
  onNewConversation?: () => void;
  onHistory?: () => void;
  onSettings?: () => void;
  onRetryPageContext?: () => void;
  pageContextRetrying?: boolean;
  floatingSupported?: boolean;
  floating?: boolean;
  floatingBusy?: boolean;
  onToggleFloating?: () => void;
}

function NewChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13" />
      <path d="M17.6 3.9a1.9 1.9 0 0 1 2.7 2.7L12.8 14l-3.4.8.8-3.4 7.4-7.5Z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="5.5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.8 9a8 8 0 1 1-.45 4M4 5v4h4" />
      <path d="M12 8v4l2.8 1.7" />
    </svg>
  );
}

function FloatingWindowIcon({ floating }: { floating: boolean }) {
  return floating ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M10 14 4.5 19.5M4.5 14v5.5H10" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M14 10 19.5 4.5M14 4.5h5.5V10" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" />
      <path d="m19 13.1 1.3 1-.2 1.4-1.6.5-.8 1.3.3 1.7-1.2.8-1.3-1-1.5.4-.7 1.6h-1.5l-.7-1.6-1.5-.4-1.3 1-1.2-.8.3-1.7-.8-1.3-1.6-.5-.2-1.4 1.3-1v-1.6l-1.3-1 .2-1.4 1.6-.5.8-1.3L6.9 5l1.2-.8 1.3 1 1.5-.4.7-1.6h1.5l.7 1.6 1.5.4 1.3-1 1.2.8-.3 1.7.8 1.3 1.6.5.2 1.4-1.3 1v1.6Z" />
    </svg>
  );
}

function FollowBrowserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17h1.1a1.7 1.7 0 0 0 0-3.4h-.7a1.9 1.9 0 0 1 0-3.8H16a4.5 4.5 0 0 0 4.5-4.5C20.5 5.9 16.7 3.5 12 3.5Z" />
      <circle cx="7.5" cy="10" r=".8" />
      <circle cx="10" cy="6.8" r=".8" />
      <circle cx="14.2" cy="6.8" r=".8" />
      <circle cx="17" cy="9.5" r=".8" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5.5 12.5 4.2 4.2 8.8-9.2" />
    </svg>
  );
}

function RetryPageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.5 8.5V4.4m0 4.1h-4.1M19.1 8A8 8 0 1 0 19.6 14" />
    </svg>
  );
}

type HeaderMenu = 'more' | 'appearance';

export function PanelHeader({
  onNewConversation,
  onHistory,
  onSettings,
  onRetryPageContext,
  pageContextRetrying = false,
  floatingSupported = false,
  floating = false,
  floatingBusy = false,
  onToggleFloating,
}: PanelHeaderProps) {
  const { messages } = useI18n();
  const { theme, setTheme, appearance, resolvedAppearance, setAppearance } = useTheme();
  const [themeBusy, setThemeBusy] = useState(false);
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const [openMenu, setOpenMenu] = useState<HeaderMenu | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const appearanceMenuRef = useRef<HTMLDivElement>(null);
  const appearanceButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuOpen = openMenu === 'more';
  const appearanceMenuOpen = openMenu === 'appearance';

  useEffect(() => {
    if (!openMenu) return;

    const items = menuItems();
    (items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!activeMenuRef().current?.contains(event.target as Node)) setOpenMenu(null);
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = menuItems();
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(current + step + items.length) % items.length]?.focus();
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [openMenu]);

  function activeMenuRef() {
    return openMenu === 'appearance' ? appearanceMenuRef : moreMenuRef;
  }

  function menuItems() {
    return Array.from(activeMenuRef().current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? []);
  }

  function closeMenu() {
    const button = openMenu === 'appearance' ? appearanceButtonRef : moreButtonRef;
    setOpenMenu(null);
    button.current?.focus();
  }

  function toggleMenu(menu: HeaderMenu) {
    setOpenMenu((current) => (current === menu ? null : menu));
  }

  function runAndClose(action?: () => void) {
    closeMenu();
    action?.();
  }

  async function chooseAppearance(nextAppearance: AppearancePreference) {
    setAppearanceBusy(true);
    try {
      await setAppearance(nextAppearance);
      closeMenu();
    } catch {
      // The provider restores the persisted appearance when saving fails.
    } finally {
      setAppearanceBusy(false);
    }
  }

  async function cycleTheme() {
    const currentIndex = THEMES.findIndex((item) => item.id === theme);
    const nextTheme = THEMES[(currentIndex + 1) % THEMES.length] ?? THEMES[0];
    setThemeBusy(true);
    try {
      await setTheme(nextTheme.id);
    } catch {
      // The provider restores the persisted theme when saving fails.
    } finally {
      setThemeBusy(false);
    }
  }

  return (
    <header className="panel-header">
      <nav className="panel-actions" aria-label={messages.conversationActions}>
        <button className="icon-button" type="button" aria-label={messages.newConversation} title={messages.newConversation} onClick={onNewConversation}>
          <NewChatIcon />
        </button>
        <button className="icon-button" type="button" aria-label={messages.history} title={messages.history} onClick={onHistory}>
          <HistoryIcon />
        </button>
        <div ref={appearanceMenuRef} className="more-menu">
          <button
            ref={appearanceButtonRef}
            className={`icon-button ${appearanceMenuOpen ? 'icon-button--active' : ''}`}
            type="button"
            aria-label={messages.appearance}
            title={messages.appearance}
            aria-haspopup="menu"
            aria-expanded={appearanceMenuOpen}
            aria-controls="panel-appearance-menu"
            onClick={() => toggleMenu('appearance')}
          >
            {appearance === 'system' ? <FollowBrowserIcon /> : resolvedAppearance === 'dark' ? <MoonIcon /> : <SunIcon />}
          </button>
          {appearanceMenuOpen ? (
            <div id="panel-appearance-menu" className="more-menu__popover" role="menu" aria-label={messages.appearance}>
              {([
                ['system', messages.appearanceSystem, FollowBrowserIcon],
                ['light', messages.appearanceLight, SunIcon],
                ['dark', messages.appearanceDark, MoonIcon],
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  className="more-menu__item more-menu__item--option"
                  type="button"
                  role="menuitemradio"
                  aria-checked={appearance === value}
                  disabled={appearanceBusy}
                  onClick={() => void chooseAppearance(value)}
                >
                  <Icon />
                  <span>{label}</span>
                  <span className="more-menu__check" aria-hidden="true">
                    {appearance === value ? <CheckIcon /> : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div ref={moreMenuRef} className="more-menu">
          <button
            ref={moreButtonRef}
            className={`icon-button ${moreMenuOpen ? 'icon-button--active' : ''} ${onRetryPageContext ? 'icon-button--attention' : ''}`}
            type="button"
            aria-label={messages.moreActions}
            title={messages.moreActions}
            aria-haspopup="menu"
            aria-expanded={moreMenuOpen}
            aria-controls="panel-more-menu"
            onClick={() => toggleMenu('more')}
          >
            <MoreIcon />
          </button>
          {moreMenuOpen ? (
            <div id="panel-more-menu" className="more-menu__popover" role="menu" aria-label={messages.moreActions}>
              {onRetryPageContext ? (
                <button
                  className="more-menu__item more-menu__item--accent"
                  type="button"
                  role="menuitem"
                  aria-busy={pageContextRetrying}
                  disabled={pageContextRetrying}
                  onClick={() => runAndClose(onRetryPageContext)}
                >
                  <RetryPageIcon />
                  <span>{pageContextRetrying ? messages.retryingPageContext : messages.retryPageContext}</span>
                </button>
              ) : null}
              {floatingSupported ? (
                <button
                  className="more-menu__item"
                  type="button"
                  role="menuitem"
                  aria-busy={floatingBusy}
                  disabled={floatingBusy}
                  onClick={() => runAndClose(onToggleFloating)}
                >
                  <FloatingWindowIcon floating={floating} />
                  <span>{floating ? messages.dockChat : messages.floatChat}</span>
                </button>
              ) : null}
              <button className="more-menu__item" type="button" role="menuitem" onClick={() => runAndClose(onSettings)}>
                <SettingsIcon />
                <span>{messages.settings}</span>
              </button>
              <button
                className="more-menu__item"
                type="button"
                role="menuitem"
                aria-busy={themeBusy}
                disabled={themeBusy}
                onClick={() => void cycleTheme()}
              >
                <ThemeIcon />
                <span>{messages.switchThemeColor}</span>
              </button>
            </div>
          ) : null}
        </div>
      </nav>
    </header>
  );
}

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { GatewayForm, type GatewayFormNotice } from '../../components/settings/GatewayForm';
import { ContextLimitSettings } from '../../components/settings/ContextLimitSettings';
import { LanguageSettings } from '../../components/settings/LanguageSettings';
import { ThemeSettings } from '../../components/settings/ThemeSettings';
import { AppearanceSettings } from '../../components/settings/AppearanceSettings';
import { WritingAssistantSettings } from '../../components/settings/WritingAssistantSettings';
import { NewChatShortcutSettings } from '../../components/settings/NewChatShortcutSettings';
import { AttachmentLimitSettings } from '../../components/settings/AttachmentLimitSettings';
import { BrowseSkills, SkillSearch, YourSkills } from '../../components/settings/SkillSettings';
import {
  isSettingsSection,
  isSkillSection,
  SETTINGS_MENU,
  SKILL_SUBSECTIONS,
  type SettingsSection,
} from '../../components/settings/settings-sections';
import { analyzeGatewayBaseUrl } from '../../core/permissions/gateway-origin';
import { ALL_SITES_ORIGINS } from '../../core/permissions/page-access-service';
import {
  ProviderConfigService,
  type ProviderSettingsItem,
} from '../../core/settings/provider-config-service';
import type { RuntimeCommand } from '../../messaging/contracts';
import { RuntimeClient } from '../../messaging/runtime-client';
import { AppError, normalizeError } from '../../shared/errors/app-error';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { localizeError } from '../../shared/i18n/locale';
import type { ConnectionTestResult, ProviderConfigSubmission } from '../../shared/types/provider';
import './options.css';

function createDefaultService(): ProviderConfigService {
  return new ProviderConfigService(new RuntimeClient(browser.runtime));
}

interface AppProps {
  service?: ProviderConfigService;
  runtime?: { send(command: RuntimeCommand): Promise<unknown> };
  gatewayPermissions?: GatewayPermissionsApi;
}

interface GatewayPermissionsApi {
  request(permissions: { origins: string[] }): Promise<boolean>;
}

function sectionFromHash(): SettingsSection {
  const hash = globalThis.location?.hash.slice(1) ?? '';
  return isSettingsSection(hash) ? hash : 'general';
}

function GeneralIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 6h6M13.5 6h3M3.5 14h3M10.5 14h6" />
      <circle cx="11.5" cy="6" r="2" />
      <circle cx="8.5" cy="14" r="2" />
    </svg>
  );
}

function ModelIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 2.8 16.2 6.4v7.2L10 17.2l-6.2-3.6V6.4L10 2.8Z" />
      <path d="M3.8 6.4 10 10l6.2-3.6M10 10v7.2" />
    </svg>
  );
}

function SkillIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11.2 2.5 4.8 11h4.6l-1 6.5L15.2 9h-4.6l.6-6.5Z" /></svg>;
}

function CompassIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="m12.6 7.4-1.5 3.7-3.7 1.5 1.5-3.7 3.7-1.5Z" />
    </svg>
  );
}

const SECTION_ICONS: Record<SettingsSection, () => ReactElement> = {
  general: GeneralIcon,
  models: ModelIcon,
  skills: CompassIcon,
  'your-skills': SkillIcon,
};

export default function App({
  service: injectedService,
  runtime: injectedRuntime,
  gatewayPermissions: injectedGatewayPermissions,
}: AppProps) {
  const { messages } = useI18n();
  useEffect(() => { document.title = messages.settings; }, [messages]);
  const service = useMemo(() => injectedService ?? createDefaultService(), [injectedService]);
  const runtime = useMemo(
    () => injectedRuntime ?? (typeof browser === 'undefined' ? undefined : new RuntimeClient(browser.runtime)),
    [injectedRuntime],
  );
  const gatewayPermissions = injectedGatewayPermissions
    ?? (typeof browser === 'undefined' ? undefined : browser.permissions);
  const [provider, setProvider] = useState<ProviderSettingsItem>();
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'models' | 'test' | 'save'>();
  const busy = busyAction !== undefined;
  // Load failures stay at the top of the page; save results render inside the form, next to the save button.
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string }>();
  const [formNotice, setFormNotice] = useState<GatewayFormNotice>();
  const [section, setSection] = useState<SettingsSection>(sectionFromHash);

  useEffect(() => {
    const onHashChange = () => setSection(sectionFromHash());
    globalThis.addEventListener?.('hashchange', onHashChange);
    return () => globalThis.removeEventListener?.('hashchange', onHashChange);
  }, []);

  function selectSection(next: SettingsSection) {
    setSection(next);
    // replaceState keeps the menu choice in the URL without adding history entries.
    globalThis.history?.replaceState?.(null, '', `#${next}`);
  }

  const [skillQuery, setSkillQuery] = useState('');
  const sectionLabels: Record<SettingsSection, string> = {
    general: messages.settingsGeneral,
    models: messages.settingsModels,
    skills: messages.builtInSkills,
    'your-skills': messages.yourSkills,
  };
  const menuLabels: Record<(typeof SETTINGS_MENU)[number], string> = {
    general: messages.settingsGeneral,
    models: messages.settingsModels,
    skills: messages.settingsSkills,
  };
  const inSkills = isSkillSection(section);

  useEffect(() => {
    let active = true;
    service.load()
      .then((snapshot) => {
        if (active) setProvider(snapshot.providers[0]);
      })
      .catch((error) => {
        if (active) setNotice({ kind: 'error', text: localizeError(normalizeError(error), messages) });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [service]);

  async function requestGatewayAccess(submission: ProviderConfigSubmission): Promise<void> {
    if (!gatewayPermissions) throw new AppError('HOST_PERMISSION_REQUIRED', '当前环境不支持 Gateway 权限授权');
    const originPattern = analyzeGatewayBaseUrl(submission.config.baseURL).originPattern;

    // permissions.request 必须直接发生在按钮点击的用户手势中。
    // 不要在它之前添加 await，也不要把请求转发到 Background Service Worker。
    // 与 Gateway 一起申请所有网站访问，页面功能在新旧页面上都能直接使用。
    const granted = await gatewayPermissions.request({ origins: [originPattern, ...ALL_SITES_ORIGINS] });
    if (!granted) {
      throw new AppError('HOST_PERMISSION_REQUIRED', '需要授权：请允许 Chrome 访问该 Gateway 后重试。');
    }
  }

  async function listModels(submission: ProviderConfigSubmission): Promise<string[]> {
    setBusyAction('models');
    try {
      await requestGatewayAccess(submission);
      return await service.listModels(submission);
    } finally {
      setBusyAction(undefined);
    }
  }

  async function testGateway(submission: ProviderConfigSubmission): Promise<ConnectionTestResult> {
    setBusyAction('test');
    try {
      await requestGatewayAccess(submission);
      return await service.testDraft(submission);
    } finally {
      setBusyAction(undefined);
    }
  }

  async function saveConfig(submission: ProviderConfigSubmission) {
    setBusyAction('save');
    setFormNotice(undefined);
    try {
      await requestGatewayAccess(submission);
      const result = await service.save(submission);
      setProvider({ config: result.config, hasApiKey: result.hasApiKey });
      setFormNotice({ kind: 'success', text: messages.configurationSaved, action: 'save' });
    } catch (error) {
      setFormNotice({ kind: 'error', text: localizeError(normalizeError(error), messages), action: 'save' });
    } finally {
      setBusyAction(undefined);
    }
  }

  async function removeSecret() {
    if (!provider) return;
    setBusyAction('save');
    setFormNotice(undefined);
    try {
      await service.removeSecret(provider.config.id);
      setProvider({ ...provider, hasApiKey: false });
      setFormNotice({ kind: 'success', text: messages.apiKeyRemoved, action: 'remove-secret' });
    } catch (error) {
      setFormNotice({ kind: 'error', text: localizeError(normalizeError(error), messages), action: 'remove-secret' });
    } finally {
      setBusyAction(undefined);
    }
  }

  return (
    <div className="options-layout">
      <nav className="options-nav" aria-label={messages.settingsNavigation}>
        <h1 className="options-nav__title">
          <img className="options-brand__logo" src={new URL('/icon/48.png', window.location.href).href} alt="" aria-hidden="true" />
          <span className="options-brand__name">{messages.appName}</span>
          <span className="options-brand__suffix">{messages.settings}</span>
        </h1>
        <ul>
          {SETTINGS_MENU.map((id) => {
            const Icon = id === 'skills' ? SkillIcon : SECTION_ICONS[id];
            const current = id === 'skills' ? inSkills : section === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  className="options-nav__item"
                  aria-current={current ? 'page' : undefined}
                  onClick={() => selectSection(id === 'skills' && inSkills ? section : id)}
                >
                  <span className="options-nav__icon" aria-hidden="true"><Icon /></span>
                  {menuLabels[id]}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <main className={`options-main ${inSkills ? 'options-main--wide' : ''}`.trim()}>
        {inSkills ? (
          <>
            <div className="options-main__toolbar">
              <h2 className="options-main__title">{messages.settingsSkills}</h2>
              <SkillSearch value={skillQuery} onChange={setSkillQuery} />
            </div>
            {/* Second-level menu sits in its own column beside the skill cards. */}
            <ul className="options-subnav" aria-label={messages.skillsSubNavigation}>
              {SKILL_SUBSECTIONS.map((sub) => {
                const SubIcon = SECTION_ICONS[sub];
                return (
                  <li key={sub}>
                    <button
                      type="button"
                      className="options-nav__item options-subnav__item"
                      aria-current={section === sub ? 'page' : undefined}
                      onClick={() => selectSection(sub)}
                    >
                      <span className="options-nav__icon" aria-hidden="true"><SubIcon /></span>
                      {sectionLabels[sub]}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : <h2 className="options-main__title">{sectionLabels[section]}</h2>}
        {section === 'general' ? (
          <>
            <LanguageSettings />
            <AppearanceSettings />
            <ThemeSettings />
            {runtime && <ContextLimitSettings runtime={runtime} />}
            {runtime && <AttachmentLimitSettings runtime={runtime} />}
            <WritingAssistantSettings />
            <NewChatShortcutSettings />
          </>
        ) : null}
        {section === 'models' ? (
          <>
            {notice && (
              <div className={`notice notice--${notice.kind}`} role="status">
                <span className="notice-dot" aria-hidden="true" />
                {notice.text}
              </div>
            )}
            {loading ? (
              <div className="settings-card loading-card" aria-live="polite">{messages.loadingConfiguration}</div>
            ) : (
              <GatewayForm
                initialConfig={provider?.config}
                hasApiKey={provider?.hasApiKey}
                busy={busy}
                busyAction={busyAction}
                notice={formNotice}
                onListModels={listModels}
                onTest={testGateway}
                onSubmit={saveConfig}
                onRemoveSecret={removeSecret}
              />
            )}
          </>
        ) : null}
        {section === 'skills' ? <div className="options-main__content"><BrowseSkills query={skillQuery} /></div> : null}
        {section === 'your-skills' ? <div className="options-main__content"><YourSkills query={skillQuery} /></div> : null}
      </main>
    </div>
  );
}

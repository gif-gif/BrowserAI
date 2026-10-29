import { useState, type CSSProperties } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { THEMES, type ThemeId } from '../../shared/theme/theme';

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5.5 12.5 4.2 4.2 8.8-9.2" /></svg>;
}

export function ThemeSettings() {
  const { messages } = useI18n();
  const { theme, setTheme } = useTheme();
  const [busyTheme, setBusyTheme] = useState<ThemeId>();
  const [error, setError] = useState(false);
  const themeNames: Record<ThemeId, string> = {
    blue: messages.themeBlue,
    indigo: messages.themeIndigo,
    violet: messages.themeViolet,
    purple: messages.themePurple,
    fuchsia: messages.themeFuchsia,
    pink: messages.themePink,
    red: messages.themeRed,
    orange: messages.themeOrange,
    amber: messages.themeAmber,
    green: messages.themeGreen,
    teal: messages.themeTeal,
    sky: messages.themeSky,
    cyan: messages.themeCyan,
    emerald: messages.themeEmerald,
    lime: messages.themeLime,
    olive: messages.themeOlive,
    gold: messages.themeGold,
    brown: messages.themeBrown,
    coral: messages.themeCoral,
    navy: messages.themeNavy,
    slate: messages.themeSlate,
  };

  async function chooseTheme(nextTheme: ThemeId) {
    if (nextTheme === theme) return;
    setBusyTheme(nextTheme);
    setError(false);
    try {
      await setTheme(nextTheme);
    } catch {
      setError(true);
    } finally {
      setBusyTheme(undefined);
    }
  }

  return (
    <section className="theme-settings" aria-labelledby="theme-settings-title">
      <div className="theme-settings__copy">
        <h3 id="theme-settings-title">{messages.themeColor}</h3>
        <p>{messages.themeColorDescription}</p>
      </div>
      <div className="theme-settings__swatches" role="radiogroup" aria-label={messages.themeColor}>
        {THEMES.map((item) => (
          <button
            key={item.id}
            className="theme-swatch"
            style={{ '--theme-swatch': item.color } as CSSProperties}
            type="button"
            role="radio"
            aria-label={themeNames[item.id]}
            aria-checked={theme === item.id}
            aria-busy={busyTheme === item.id}
            title={themeNames[item.id]}
            disabled={busyTheme !== undefined}
            onClick={() => void chooseTheme(item.id)}
          >
            {theme === item.id ? <CheckIcon /> : null}
          </button>
        ))}
      </div>
      <span className="theme-settings__selected">{themeNames[theme]}</span>
      {error && <p className="theme-settings__error" role="alert">{messages.themeChangeFailed}</p>}
    </section>
  );
}

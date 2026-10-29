import { useState } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { useTheme } from '../../shared/theme/ThemeProvider';
import type { AppearancePreference } from '../../shared/theme/appearance';
import { Select } from '../ui/Select';

export function AppearanceSettings() {
  const { messages } = useI18n();
  const { appearance, setAppearance } = useTheme();
  const [error, setError] = useState(false);

  async function changeAppearance(nextAppearance: AppearancePreference) {
    setError(false);
    try {
      await setAppearance(nextAppearance);
    } catch {
      setError(true);
    }
  }

  return (
    <section className="language-settings" aria-labelledby="appearance-settings-title">
      <div className="language-settings__copy">
        <h3 id="appearance-settings-title">{messages.appearance}</h3>
        <p>{messages.appearanceDescription}</p>
      </div>
      <Select
        className="language-settings__control"
        ariaLabel={messages.appearance}
        value={appearance}
        options={[
          { value: 'system', label: messages.appearanceSystem },
          { value: 'light', label: messages.appearanceLight },
          { value: 'dark', label: messages.appearanceDark },
        ]}
        onChange={(next) => void changeAppearance(next)}
      />
      {error && <p className="language-settings__error" role="alert">{messages.appearanceChangeFailed}</p>}
    </section>
  );
}

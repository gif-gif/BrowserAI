import { useState } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider';
import type { LanguagePreference } from '../../shared/i18n/language-preference';
import { Select } from '../ui/Select';

export function LanguageSettings() {
  const { messages, preference, setPreference } = useI18n();
  const [error, setError] = useState(false);

  async function changeLanguage(nextPreference: LanguagePreference) {
    setError(false);
    try {
      await setPreference(nextPreference);
    } catch {
      setError(true);
    }
  }

  return (
    <section className="language-settings" aria-labelledby="language-settings-title">
      <div className="language-settings__copy">
        <h3 id="language-settings-title">{messages.displayLanguage}</h3>
        <p>{messages.displayLanguageDescription}</p>
      </div>
      <Select
        className="language-settings__control"
        ariaLabel={messages.displayLanguage}
        value={preference}
        options={[
          { value: 'auto', label: messages.followBrowserLanguage },
          { value: 'zh-CN', label: messages.simplifiedChinese },
          { value: 'zh-TW', label: messages.traditionalChinese },
          { value: 'en', label: messages.english },
        ]}
        onChange={(next) => void changeLanguage(next)}
      />
      {error && <p className="language-settings__error" role="alert">{messages.languageChangeFailed}</p>}
    </section>
  );
}

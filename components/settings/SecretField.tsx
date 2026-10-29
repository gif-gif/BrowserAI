import { useI18n } from '../../shared/i18n/I18nProvider';
interface SecretFieldProps {
  value: string;
  onChange(value: string): void;
  hasStoredSecret: boolean;
  disabled?: boolean;
  onRemove(): void;
}

export function SecretField({ value, onChange, hasStoredSecret, disabled, onRemove }: SecretFieldProps) {
  const { messages } = useI18n();
  return (
    <div className="field-group">
      <div className="field-label-row">
        <label htmlFor="api-key">{messages.apiKey}</label>
        {hasStoredSecret && <span className="status-badge status-badge--success">{messages.configured}</span>}
      </div>
      <input
        id="api-key"
        type="password"
        autoComplete="new-password"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={hasStoredSecret ? messages.keepSecretPlaceholder : 'Gateway API Key'}
      />
      <div className="field-help-row">
        <span>{messages.secretStorageHint}</span>
        {hasStoredSecret && (
          <button className="remove-secret-button" type="button" disabled={disabled} onClick={onRemove}>
            <svg className="remove-secret-button__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 7h14M10 11v6M14 11v6M8 7l1-2h6l1 2m-9 0 .8 13h8.4L17 7" />
            </svg>
            <span>{messages.removeSecret}</span>
          </button>
        )}
      </div>
    </div>
  );
}

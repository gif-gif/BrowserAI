export type DomAction =
  | { type: 'click'; ref: string }
  | { type: 'focus'; ref: string }
  | { type: 'scrollIntoView'; ref: string }
  | { type: 'setValue'; ref: string; value: string }
  | { type: 'select'; ref: string; value: string };

export interface DomElementSummary {
  ref: string;
  tag: string;
  role?: string;
  type?: string;
  text?: string;
  label?: string;
  placeholder?: string;
  value?: string;
  href?: string;
  checked?: boolean;
  disabled?: boolean;
  options?: Array<{ value: string; label: string }>;
}

export interface DomSnapshot {
  url: string;
  title: string;
  capturedAt: number;
  elements: DomElementSummary[];
  truncated: boolean;
}

export interface DomActionResult {
  action: DomAction;
  success: boolean;
  message: string;
  confirmationRequired?: boolean;
}

export interface DomActionBatchResult {
  results: DomActionResult[];
  url: string;
  title: string;
}

import type {
  DomAction,
  DomActionBatchResult,
  DomActionResult,
  DomElementSummary,
  DomSnapshot,
} from '../../shared/types/dom-actions';

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const HIGH_RISK_PATTERN = /(?:delete|remove\s+(?:account|card)|buy\s+now|purchase|pay\s+now|transfer|confirm\s+order|place\s+order|unsubscribe|publish|send\s+money|删除|刪除|移除账户|移除帳戶|购买|購買|支付|付款|转账|轉帳|确认订单|確認訂單|提交订单|提交訂單|退订|退訂|发布|發佈)/i;

function cleanText(value: string | null | undefined, max = 160): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : undefined;
}

function elementText(element: Element): string | undefined {
  if (element instanceof HTMLInputElement) return cleanText(element.value || element.getAttribute('value'));
  return cleanText((element as HTMLElement).innerText || element.textContent);
}

function elementLabel(element: Element, document: Document): string | undefined {
  const aria = cleanText(element.getAttribute('aria-label'));
  if (aria) return aria;
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = cleanText(labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
    if (text) return text;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const labels = [...(element.labels ?? [])].map((label) => label.textContent ?? '').join(' ');
    const text = cleanText(labels);
    if (text) return text;
  }
  return cleanText(element.getAttribute('title') || element.getAttribute('alt'));
}

function isHidden(element: Element): boolean {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return true;
  const style = (element as HTMLElement).style;
  if (style?.display === 'none' || style?.visibility === 'hidden') return true;
  return false;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
}

function dispatchValueEvents(element: Element): void {
  element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

export class DomPageController {
  private refs = new Map<string, Element>();
  private sequence = 0;

  constructor(private readonly document: Document, private readonly now: () => number = Date.now) {}

  snapshot(maxElements = 120): DomSnapshot {
    this.refs.clear();
    this.sequence = 0;
    const candidates = [...this.document.querySelectorAll(INTERACTIVE_SELECTOR)].filter((element) => !isHidden(element));
    const elements = candidates.slice(0, maxElements).map((element) => this.describe(element));
    return {
      url: this.document.location?.href ?? '',
      title: this.document.title,
      capturedAt: this.now(),
      elements,
      truncated: candidates.length > maxElements,
    };
  }

  execute(actions: DomAction[]): DomActionBatchResult {
    return {
      results: actions.map((action) => this.executeOne(action)),
      url: this.document.location?.href ?? '',
      title: this.document.title,
    };
  }

  private describe(element: Element): DomElementSummary {
    const ref = `e${++this.sequence}`;
    this.refs.set(ref, element);
    const input = element instanceof HTMLInputElement ? element : undefined;
    const textarea = element instanceof HTMLTextAreaElement ? element : undefined;
    const select = element instanceof HTMLSelectElement ? element : undefined;
    const value = input?.type === 'password' || input?.type === 'file'
      ? undefined
      : input?.value ?? textarea?.value ?? select?.value;
    return {
      ref,
      tag: element.tagName.toLowerCase(),
      ...(element.getAttribute('role') ? { role: element.getAttribute('role')! } : {}),
      ...(input?.type ? { type: input.type } : {}),
      ...(elementText(element) ? { text: elementText(element)! } : {}),
      ...(elementLabel(element, this.document) ? { label: elementLabel(element, this.document)! } : {}),
      ...(element.getAttribute('placeholder') ? { placeholder: element.getAttribute('placeholder')! } : {}),
      ...(value ? { value: value.slice(0, 160) } : {}),
      ...(element instanceof HTMLAnchorElement && element.href ? { href: element.href } : {}),
      ...('checked' in element && typeof element.checked === 'boolean' ? { checked: element.checked } : {}),
      ...('disabled' in element && typeof element.disabled === 'boolean' ? { disabled: element.disabled } : {}),
      ...(select ? {
        options: [...select.options].slice(0, 50).map((option) => ({ value: option.value, label: cleanText(option.textContent, 80) ?? option.value })),
      } : {}),
    };
  }

  private executeOne(action: DomAction): DomActionResult {
    const element = this.refs.get(action.ref);
    if (!element || !element.isConnected) return { action, success: false, message: `Element ${action.ref} is no longer available.` };
    if ('disabled' in element && element.disabled === true) return { action, success: false, message: `Element ${action.ref} is disabled.` };

    try {
      if (!element.isConnected) {
        return { action, success: false, message: `Element ${action.ref} is no longer available. Refresh the page inventory and try again.` };
      }
      if (
        (element instanceof HTMLButtonElement
          || element instanceof HTMLInputElement
          || element instanceof HTMLTextAreaElement
          || element instanceof HTMLSelectElement)
        && element.disabled
      ) {
        return { action, success: false, message: `Element ${action.ref} is disabled.` };
      }
      if (action.type === 'click') {
        const description = [elementLabel(element, this.document), elementText(element), element.getAttribute('name')].filter(Boolean).join(' ');
        if (HIGH_RISK_PATTERN.test(description)) {
          return { action, success: false, confirmationRequired: true, message: 'This sensitive action requires the user to click the element manually.' };
        }
        (element as HTMLElement).scrollIntoView?.({ block: 'center', inline: 'nearest' });
        (element as HTMLElement).click();
        return { action, success: true, message: `Clicked ${action.ref}.` };
      }
      if (action.type === 'focus') {
        (element as HTMLElement).focus();
        return { action, success: true, message: `Focused ${action.ref}.` };
      }
      if (action.type === 'scrollIntoView') {
        (element as HTMLElement).scrollIntoView?.({ block: 'center', inline: 'nearest' });
        return { action, success: true, message: `Scrolled ${action.ref} into view.` };
      }
      if (action.type === 'setValue') {
        if (element instanceof HTMLInputElement && (element.type === 'password' || element.type === 'file')) {
          return { action, success: false, confirmationRequired: true, message: 'Passwords and files must be entered by the user.' };
        }
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          if (element.readOnly) return { action, success: false, message: `Element ${action.ref} is read-only.` };
          setNativeValue(element, action.value);
          dispatchValueEvents(element);
          return { action, success: true, message: `Updated ${action.ref}.` };
        }
        if (element instanceof HTMLElement && element.isContentEditable) {
          element.textContent = action.value;
          dispatchValueEvents(element);
          return { action, success: true, message: `Updated ${action.ref}.` };
        }
        return { action, success: false, message: `Element ${action.ref} does not accept text.` };
      }
      if (!(element instanceof HTMLSelectElement)) return { action, success: false, message: `Element ${action.ref} is not a select control.` };
      if (![...element.options].some((option) => option.value === action.value)) {
        return { action, success: false, message: `Option ${action.value} is not available in ${action.ref}.` };
      }
      element.value = action.value;
      dispatchValueEvents(element);
      return { action, success: true, message: `Selected an option in ${action.ref}.` };
    } catch (error) {
      return { action, success: false, message: error instanceof Error ? error.message : `Could not operate ${action.ref}.` };
    }
  }
}

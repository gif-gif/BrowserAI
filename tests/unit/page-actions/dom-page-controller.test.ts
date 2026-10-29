import { describe, expect, it, vi } from 'vitest';
import { DomPageController } from '../../../core/page-actions/dom-page-controller';

describe('DomPageController', () => {
  it('exposes compact interactive element refs and executes safe input and click actions', () => {
    document.body.innerHTML = `
      <label for="query">Search</label>
      <input id="query" placeholder="Keywords">
      <button id="go">Go</button>
    `;
    const clicked = vi.fn();
    document.querySelector('#go')!.addEventListener('click', clicked);
    const controller = new DomPageController(document, () => 10);
    const snapshot = controller.snapshot();
    const input = snapshot.elements.find((item) => item.tag === 'input')!;
    const button = snapshot.elements.find((item) => item.tag === 'button')!;

    const result = controller.execute([
      { type: 'setValue', ref: input.ref, value: 'Browser AI' },
      { type: 'click', ref: button.ref },
    ]);

    expect(snapshot).toMatchObject({ capturedAt: 10, truncated: false });
    expect(input).toMatchObject({ label: 'Search', placeholder: 'Keywords' });
    expect((document.querySelector('#query') as HTMLInputElement).value).toBe('Browser AI');
    expect(clicked).toHaveBeenCalledOnce();
    expect(result.results.every((item) => item.success)).toBe(true);
  });

  it('blocks passwords and high-risk clicks', () => {
    document.body.innerHTML = `
      <input type="password" aria-label="Password">
      <button>Delete account</button>
    `;
    const controller = new DomPageController(document);
    const snapshot = controller.snapshot();
    const password = snapshot.elements.find((item) => item.type === 'password')!;
    const destructive = snapshot.elements.find((item) => item.tag === 'button')!;

    const result = controller.execute([
      { type: 'setValue', ref: password.ref, value: 'secret' },
      { type: 'click', ref: destructive.ref },
    ]);

    expect(result.results).toEqual([
      expect.objectContaining({ success: false, confirmationRequired: true }),
      expect.objectContaining({ success: false, confirmationRequired: true }),
    ]);
    expect((document.querySelector('input') as HTMLInputElement).value).toBe('');
  });
  it('rejects stale, disabled, read-only, and invalid select actions', () => {
    document.body.innerHTML = `
      <button disabled>Go</button>
      <input readonly value="fixed">
      <select><option value="one">One</option></select>
      <a href="#next">Next</a>
    `;
    const controller = new DomPageController(document);
    const snapshot = controller.snapshot();
    const button = snapshot.elements.find((item) => item.tag === 'button')!;
    const input = snapshot.elements.find((item) => item.tag === 'input')!;
    const select = snapshot.elements.find((item) => item.tag === 'select')!;
    const link = snapshot.elements.find((item) => item.tag === 'a')!;
    document.querySelector('a')!.remove();

    const result = controller.execute([
      { type: 'click', ref: button.ref },
      { type: 'setValue', ref: input.ref, value: 'changed' },
      { type: 'select', ref: select.ref, value: 'missing' },
      { type: 'click', ref: link.ref },
    ]);

    expect(result.results.every((item) => !item.success)).toBe(true);
    expect((document.querySelector('input') as HTMLInputElement).value).toBe('fixed');
    expect((document.querySelector('select') as HTMLSelectElement).value).toBe('one');
  });

});

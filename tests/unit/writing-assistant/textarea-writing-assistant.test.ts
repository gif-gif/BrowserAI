import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextareaWritingAssistant } from '../../../core/writing-assistant/textarea-writing-assistant';
import { en } from '../../../shared/i18n/en';
import { zhCN } from '../../../shared/i18n/zh-CN';

function rect(): DOMRect {
  return {
    x: 100, y: 100, left: 100, top: 100, right: 500, bottom: 240,
    width: 400, height: 140, toJSON: () => ({}),
  } as DOMRect;
}

function shadowElements() {
  const host = document.querySelector<HTMLElement>('[data-chrome-ai-writing-assistant="true"]')!;
  const shadow = host.shadowRoot!;
  return {
    host,
    shadow,
    launcher: shadow.querySelector<HTMLButtonElement>('.launcher')!,
    panel: shadow.querySelector<HTMLElement>('.panel')!,
    header: shadow.querySelector<HTMLElement>('.header')!,
    content: shadow.querySelector<HTMLElement>('.content')!,
    close: shadow.querySelector<HTMLButtonElement>('.close-button')!,
    source: shadow.querySelector<HTMLElement>('.source-preview')!,
    model: shadow.querySelector<HTMLButtonElement>('#chrome-ai-writing-model')!,
    modelSearch: shadow.querySelector<HTMLInputElement>('#chrome-ai-writing-model-search')!,
    modelPopover: shadow.querySelector<HTMLElement>('.model-popover')!,
    modelOptions: () => [...shadow.querySelectorAll<HTMLElement>('.model-option')],
    tone: shadow.querySelector<HTMLSelectElement>('#chrome-ai-writing-tone')!,
    toneTrigger: shadow.querySelector<HTMLButtonElement>('#chrome-ai-writing-tone-trigger')!,
    tonePopover: shadow.querySelector<HTMLElement>('.tone-popover')!,
    toneOptions: [...shadow.querySelectorAll<HTMLElement>('.tone-option')],
    context: shadow.querySelector<HTMLInputElement>('#chrome-ai-writing-context')!,
    generate: shadow.querySelector<HTMLButtonElement>('.generate-button')!,
    resultWrap: shadow.querySelector<HTMLElement>('.result-wrap')!,
    result: shadow.querySelector<HTMLDivElement>('#chrome-ai-writing-result')!,
    insert: shadow.querySelector<HTMLButtonElement>('.insert-button')!,
    retry: shadow.querySelector<HTMLButtonElement>('.retry-button')!,
    copy: shadow.querySelector<HTMLButtonElement>('.copy-button')!,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.querySelectorAll('[data-chrome-ai-writing-assistant="true"]').forEach((node) => node.remove());
});

describe('TextareaWritingAssistant', () => {

  it('updates every visible label when the display language changes', () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite: vi.fn(),
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '需要润色的内容';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();

    try {
      const elements = shadowElements();
      elements.launcher.click();
      assistant.setMessages(en);

      expect(elements.launcher.getAttribute('aria-label')).toBe(en.writingAssistantOpen);
      expect(elements.shadow.querySelector('.title')?.textContent).toBe(en.writingAssistantTitle);
      expect(elements.close.getAttribute('aria-label')).toBe(en.writingAssistantClose);
      expect(elements.shadow.querySelector('.model-label')?.textContent).toBe(en.model);
      expect(elements.context.placeholder).toBe(en.writingAssistantContextPlaceholder);
      expect(elements.generate.getAttribute('aria-label')).toBe(en.writingAssistantGenerate);
      expect(elements.insert.textContent).toBe(en.writingAssistantInsert);
      expect(elements.retry.textContent).toBe(en.retry);
      expect(elements.copy.getAttribute('aria-label')).toBe(en.copy);
      expect(elements.toneOptions.map((option) => option.textContent)).toEqual(expect.arrayContaining([
        expect.stringContaining(en.writingTonePolish),
        expect.stringContaining(en.writingToneProfessional),
        expect.stringContaining(en.writingToneFriendly),
        expect.stringContaining(en.writingToneConcise),
      ]));
    } finally {
      assistant.stop();
    }
  });

  it('constrains long English header copy inside the panel width', () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: en,
      requestRewrite: vi.fn(),
    });
    assistant.start();

    try {
      const elements = shadowElements();
      const style = elements.shadow.querySelector('style')?.textContent ?? '';
      expect(elements.shadow.querySelector('.description')?.textContent).toBe(en.writingAssistantDescription);
      expect(style).toContain('grid-template-columns: 36px minmax(0, 1fr) 40px');
      expect(style).toContain('overflow-wrap: anywhere');
      expect(style).toContain('-webkit-line-clamp: 2');
      // Both dropdown menus are absolutely positioned and need a positioned wrapper to anchor under their trigger.
      expect(style).toContain('.model-picker-wrap, .tone-picker-wrap { position: relative; }');
    } finally {
      assistant.stop();
    }
  });

  it('refreshes the saved display language when a textarea is focused and the launcher is opened', async () => {
    const loadMessages = vi.fn(async () => en);
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      loadMessages,
      requestRewrite: vi.fn(),
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = 'Text to improve';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);

    try {
      textarea.focus();
      await Promise.resolve();
      await Promise.resolve();

      const elements = shadowElements();
      expect(loadMessages).toHaveBeenCalledTimes(1);
      expect(elements.shadow.querySelector('.title')?.textContent).toBe(en.writingAssistantTitle);

      elements.launcher.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(loadMessages).toHaveBeenCalledTimes(2);
      expect(elements.generate.getAttribute('aria-label')).toBe(en.writingAssistantGenerate);
    } finally {
      assistant.stop();
    }
  });

  it('does not let a stale language load overwrite a newer shared language selection', async () => {
    const resolvers: Array<(messages: typeof zhCN) => void> = [];
    const loadMessages = vi.fn(() => new Promise<typeof zhCN>((resolve) => resolvers.push(resolve)));
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      loadMessages,
      requestRewrite: vi.fn(),
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = 'Text to improve';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);

    try {
      textarea.focus();
      const elements = shadowElements();
      elements.launcher.click();
      await vi.waitFor(() => expect(loadMessages).toHaveBeenCalledTimes(2));

      // Simulate the language selected in Settings or Chat arriving through
      // browser.storage.onChanged while older storage reads are still pending.
      assistant.setMessages(en);
      for (const resolve of resolvers) resolve(zhCN);
      await Promise.resolve();
      await Promise.resolve();

      expect(elements.shadow.querySelector('.title')?.textContent).toBe(en.writingAssistantTitle);
      expect(elements.context.placeholder).toBe(en.writingAssistantContextPlaceholder);
      expect(elements.generate.getAttribute('aria-label')).toBe(en.writingAssistantGenerate);
    } finally {
      assistant.stop();
    }
  });

  it('hides the launcher and closes the panel when the setting is disabled', () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite: vi.fn(),
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '需要润色的内容';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);

    try {
      textarea.focus();
      const elements = shadowElements();
      expect(elements.launcher.style.display).toBe('flex');
      elements.launcher.click();
      expect(elements.panel.style.display).toBe('block');

      assistant.setEnabled(false);
      expect(elements.launcher.style.display).toBe('none');
      expect(elements.panel.style.display).toBe('none');

      textarea.blur();
      textarea.focus();
      expect(elements.launcher.style.display).toBe('none');

      assistant.setEnabled(true);
      expect(elements.launcher.style.display).toBe('flex');
    } finally {
      assistant.stop();
    }
  });

  it('filters models with the search box and supports keyboard selection', async () => {
    const requestRewrite = vi.fn(async () => ({ text: '结果' }));
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      loadModels: async () => ({ model: 'gpt-4o', models: ['gpt-4o', 'claude-sonnet', 'claude-haiku', 'gemini-pro'] }),
      requestRewrite,
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '原文';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);

    const elements = shadowElements();
    elements.launcher.click();
    await vi.waitFor(() => expect(elements.model.disabled).toBe(false));

    elements.model.click();
    expect(elements.modelSearch.placeholder).toBe('搜索模型');
    elements.modelSearch.value = 'CLAUDE';
    elements.modelSearch.dispatchEvent(new Event('input', { bubbles: true }));
    expect(elements.modelOptions().map((option) => option.textContent)).toEqual(['claude-sonnet', 'claude-haiku']);

    elements.modelSearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    elements.modelSearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(elements.model.textContent).toBe('claude-haiku');
    expect(elements.shadow.activeElement).toBe(elements.model);

    elements.model.click();
    elements.modelSearch.value = 'nothing';
    elements.modelSearch.dispatchEvent(new Event('input', { bubbles: true }));
    expect(elements.modelPopover.textContent).toContain('没有匹配的模型');
    elements.modelSearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(elements.modelPopover.dataset.open).toBeUndefined();
    expect(elements.model.textContent).toBe('claude-haiku');

    elements.model.click();
    elements.content.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(elements.modelPopover.dataset.open).toBeUndefined();

    elements.generate.click();
    await vi.waitFor(() => expect(requestRewrite).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-haiku' })));
    assistant.stop();
  });

  it('loads available models and sends the selected model with the rewrite request', async () => {
    const requestRewrite = vi.fn(async () => ({ text: '使用另一个模型润色后的文字。' }));
    const loadModels = vi.fn(async () => ({
      model: 'model-default',
      models: ['model-fast', 'model-default', 'model-reasoning'],
    }));
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      loadModels,
      requestRewrite,
      createRequestId: () => 'writing-model-select',
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '需要润色的原文';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);

    const elements = shadowElements();
    elements.launcher.click();

    await vi.waitFor(() => expect(elements.model.disabled).toBe(false));
    expect(loadModels).toHaveBeenCalledOnce();
    expect(elements.model.textContent).toBe('model-default');
    expect(elements.modelPopover.dataset.open).toBeUndefined();

    elements.model.click();
    expect(elements.modelPopover.dataset.open).toBe('true');
    expect(elements.model.getAttribute('aria-expanded')).toBe('true');
    expect(elements.shadow.activeElement).toBe(elements.modelSearch);
    expect(elements.modelOptions().map((option) => option.textContent)).toEqual([
      'model-default',
      'model-fast',
      'model-reasoning',
    ]);
    expect(elements.modelOptions()[0]!.getAttribute('aria-selected')).toBe('true');

    elements.modelOptions()[2]!.click();
    expect(elements.modelPopover.dataset.open).toBeUndefined();
    expect(elements.model.textContent).toBe('model-reasoning');
    elements.generate.click();

    await vi.waitFor(() => expect(requestRewrite).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'writing-model-select',
      model: 'model-reasoning',
      text: '需要润色的原文',
      tone: 'polish',
    })));

    assistant.stop();
  });

  it('shows only for focused textareas, never regular inputs', () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite: vi.fn(),
    });
    assistant.start();
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    textarea.getBoundingClientRect = rect;
    document.body.append(input, textarea);
    const { launcher } = shadowElements();

    input.focus();
    expect(launcher.style.display).toBe('');
    textarea.focus();
    expect(launcher.style.display).toBe('flex');
    expect(launcher.style.left).toBe('471px');
    expect(launcher.style.top).toBe('211px');
    expect(launcher.getAttribute('aria-label')).toBe('打开 AI 写作助手');
    expect(launcher.textContent).toBe('');
    expect(launcher.querySelector('svg .logo-c')).not.toBeNull();
    expect(launcher.querySelector('svg .logo-spark')).not.toBeNull();
    const brandMark = launcher.getRootNode() instanceof ShadowRoot ? (launcher.getRootNode() as ShadowRoot).querySelector('.brand-mark') : null;
    expect(brandMark?.querySelector('svg .logo-c')).not.toBeNull();
    expect(brandMark?.querySelector('svg .logo-spark')).not.toBeNull();

    assistant.stop();
  });

  it('does not use the initial textarea value until the user selects text', async () => {
    const requestRewrite = vi.fn(async () => ({ text: '润色后的文字' }));
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite,
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '不能自动作为原文';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();

    const elements = shadowElements();
    elements.launcher.click();

    expect(elements.source.textContent).toBe('');
    expect(elements.generate.disabled).toBe(true);
    elements.generate.click();
    expect(requestRewrite).not.toHaveBeenCalled();

    textarea.setSelectionRange(2, 6);
    textarea.dispatchEvent(new Event('select', { bubbles: true, composed: true }));

    expect(elements.source.textContent).toBe('自动作为');
    expect(elements.generate.disabled).toBe(false);

    assistant.stop();
  });

  it('uses newly selected text after opening an empty textarea instead of the full textarea value', async () => {
    const requestRewrite = vi.fn(async () => ({ text: '润色后的文字' }));
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite,
      createRequestId: () => 'writing-late-source',
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();

    const elements = shadowElements();
    elements.launcher.click();
    expect(elements.generate.disabled).toBe(true);

    textarea.value = '前文打开助手后再选择的文字后文';
    textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    expect(elements.source.textContent).toBe('');
    expect(elements.generate.disabled).toBe(true);

    textarea.setSelectionRange(2, 13);
    textarea.dispatchEvent(new Event('select', { bubbles: true, composed: true }));

    expect(elements.source.textContent).toBe('打开助手后再选择的文字');
    expect(elements.generate.disabled).toBe(false);

    elements.generate.click();
    await vi.waitFor(() => expect(requestRewrite).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'writing-late-source',
      text: '打开助手后再选择的文字',
    })));

    assistant.stop();
  });

  it('rewrites and replaces only the selected textarea text', async () => {
    const requestRewrite = vi.fn(async () => ({ text: '改写后的片段' }));
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite,
      createRequestId: () => 'writing-selection',
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '前文需要润色的片段后文';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(2, 9);

    const elements = shadowElements();
    elements.launcher.click();

    expect(elements.source.textContent).toBe('需要润色的片段');
    elements.generate.click();
    await vi.waitFor(() => expect(requestRewrite).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'writing-selection',
      text: '需要润色的片段',
    })));
    await vi.waitFor(() => expect(elements.result.textContent).toBe('改写后的片段'));

    elements.insert.click();
    expect(textarea.value).toBe('前文改写后的片段后文');
    expect(textarea.selectionStart).toBe(8);
    expect(textarea.selectionEnd).toBe(8);
    expect(elements.source.textContent).toBe('需要润色的片段');

    textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.dispatchEvent(new Event('select', { bubbles: true, composed: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(elements.source.textContent).toBe('需要润色的片段');

    assistant.stop();
  });

  it('keeps the captured source unchanged when textarea input and change events fire', async () => {
    const requestRewrite = vi.fn(async () => ({ text: '新的片段' }));
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite,
      createRequestId: () => 'writing-selection-change',
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '前文选中内容后文';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(2, 6);

    const elements = shadowElements();
    elements.launcher.click();
    expect(elements.source.textContent).toBe('选中内容');

    textarea.value = '前文更新内容后文';
    textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

    expect(elements.source.textContent).toBe('选中内容');
    elements.generate.click();
    await vi.waitFor(() => expect(requestRewrite).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'writing-selection-change',
      text: '选中内容',
    })));

    assistant.stop();
  });

  it('ignores textarea values normalized by a framework onChange handler', async () => {
    const requestRewrite = vi.fn(async () => ({ text: '新的片段' }));
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite,
      createRequestId: () => 'writing-controlled-change',
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '前文选中内容后文';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(2, 6);
    textarea.addEventListener('input', () => {
      // Simulates a controlled component updating the DOM from onChange after
      // the document capture listener has already observed the native input.
      textarea.value = '前文标准内容后文';
    });

    const elements = shadowElements();
    elements.launcher.click();
    textarea.value = '前文更新内容后文';
    textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(elements.source.textContent).toBe('选中内容');
    elements.generate.click();
    await vi.waitFor(() => expect(requestRewrite).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'writing-controlled-change',
      text: '选中内容',
    })));

    assistant.stop();
  });

  it('anchors the launcher to the textarea bottom-right inside transformed popups', () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite: vi.fn(),
    });
    assistant.start();
    const popover = document.createElement('div');
    popover.setAttribute('role', 'dialog');
    const textarea = document.createElement('textarea');
    textarea.getBoundingClientRect = rect;
    popover.append(textarea);
    document.body.append(popover);
    textarea.focus();

    const { host, launcher } = shadowElements();
    Object.defineProperties(host, {
      offsetWidth: { configurable: true, value: 600 },
      offsetHeight: { configurable: true, value: 400 },
    });
    host.getBoundingClientRect = () => ({
      x: 40, y: 60, left: 40, top: 60, right: 640, bottom: 460,
      width: 600, height: 400, toJSON: () => ({}),
    }) as DOMRect;
    window.dispatchEvent(new Event('resize'));

    expect(launcher.style.left).toBe('431px');
    expect(launcher.style.top).toBe('151px');
    expect(launcher.style.visibility).toBe('visible');

    launcher.click();
    const { panel } = shadowElements();
    const panelLeft = Number.parseFloat(panel.style.left);
    const panelTop = Number.parseFloat(panel.style.top);
    const panelWidth = Number.parseFloat(panel.style.width);
    const panelHeight = Number.parseFloat(panel.style.height);
    expect(panelLeft + panelWidth).toBe(455);
    expect(panelTop).toBeGreaterThanOrEqual(12);
    expect(panelTop + panelHeight).toBeLessThanOrEqual(388);

    assistant.stop();
  });

  it('aligns the panel with the launcher and keeps it inside the viewport', () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite: vi.fn(),
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '需要润色的内容';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();

    const { launcher, panel } = shadowElements();
    launcher.click();

    const left = Number.parseFloat(panel.style.left);
    const top = Number.parseFloat(panel.style.top);
    const width = Number.parseFloat(panel.style.width);
    const height = Number.parseFloat(panel.style.height);
    const launcherRight = Number.parseFloat(launcher.style.left) + 24;
    expect(left + width).toBe(launcherRight);
    expect(top).toBeGreaterThanOrEqual(12);
    expect(top + height).toBeLessThanOrEqual(window.innerHeight - 12);
    expect(panel.style.top).toBe('243px');

    assistant.stop();
  });

  it('lets the user drag the assistant by its header without snapping back', () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite: vi.fn(),
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '需要润色的内容';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();

    const { launcher, panel, header } = shadowElements();
    launcher.click();
    const initialLeft = Number.parseFloat(panel.style.left);
    const initialTop = Number.parseFloat(panel.style.top);
    const pointer = (type: string, clientX: number, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, composed: true, button: 0, clientX, clientY });
      Object.defineProperty(event, 'pointerId', { value: 7 });
      return event;
    };

    header.dispatchEvent(pointer('pointerdown', initialLeft + 60, initialTop + 24));
    header.dispatchEvent(pointer('pointermove', initialLeft + 120, initialTop - 16));
    header.dispatchEvent(pointer('pointerup', initialLeft + 120, initialTop - 16));

    expect(panel.style.left).toBe(`${initialLeft + 60}px`);
    expect(panel.style.top).toBe(`${initialTop - 40}px`);
    expect(header.dataset.dragging).toBeUndefined();

    window.dispatchEvent(new Event('resize'));
    expect(panel.style.left).toBe(`${initialLeft + 60}px`);
    expect(panel.style.top).toBe(`${initialTop - 40}px`);

    assistant.stop();
  });

  it('keeps the header and composer visible while long results scroll inside the viewport', () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite: vi.fn(),
    });
    assistant.start();

    const { shadow } = shadowElements();
    const styles = shadow.querySelector('style')?.textContent ?? '';
    expect(styles).toContain('height: min(680px, calc(100dvh - 24px));');
    expect(styles).toMatch(/\.panel-layout\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/s);
    expect(styles).toMatch(/\.content\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow-y:\s*scroll/s);
    expect(styles).toMatch(/\.composer-shell\s*\{[^}]*flex:\s*0 0 auto/s);

    assistant.stop();
  });

  it('opens without triggering page outside-click handlers or blurring the source textarea', async () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite: vi.fn(),
    });
    assistant.start();
    const popover = document.createElement('div');
    popover.setAttribute('role', 'dialog');
    const textarea = document.createElement('textarea');
    textarea.value = '需要润色的内容';
    textarea.getBoundingClientRect = rect;
    popover.append(textarea);
    document.body.append(popover);
    textarea.focus();

    const outsideInteraction = vi.fn((event: Event) => {
      if (!(event.target instanceof Node) || !popover.contains(event.target)) popover.remove();
    });
    const focusExit = vi.fn((event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !popover.contains(event.relatedTarget)) popover.remove();
    });
    const textareaBlur = vi.fn(() => popover.remove());
    document.addEventListener('pointerdown', outsideInteraction, true);
    document.addEventListener('mousedown', outsideInteraction, true);
    document.addEventListener('click', outsideInteraction, true);
    popover.addEventListener('focusout', focusExit);
    textarea.addEventListener('blur', textareaBlur);

    try {
      const { host, launcher, panel, context } = shadowElements();
      for (const type of ['pointerdown', 'mousedown', 'click']) {
        launcher.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true }));
      }

      expect(outsideInteraction).not.toHaveBeenCalled();
      expect(popover.contains(host)).toBe(true);
      expect(popover.isConnected).toBe(true);
      expect(panel.style.display).toBe('block');
      expect(document.activeElement).toBe(textarea);

      for (const type of ['pointerdown', 'mousedown', 'click']) {
        context.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true }));
      }
      context.focus();
      expect(popover.isConnected).toBe(true);
      expect(panel.style.display).toBe('block');
      expect(host.shadowRoot?.activeElement).toBe(context);
      expect(outsideInteraction).toHaveBeenCalled();
      expect(focusExit).not.toHaveBeenCalled();
      expect(textareaBlur).not.toHaveBeenCalled();

      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(popover.isConnected).toBe(true);
      expect(panel.style.display).toBe('block');
    } finally {
      document.removeEventListener('pointerdown', outsideInteraction, true);
      document.removeEventListener('mousedown', outsideInteraction, true);
      document.removeEventListener('click', outsideInteraction, true);
      popover.removeEventListener('focusout', focusExit);
      textarea.removeEventListener('blur', textareaBlur);
      assistant.stop();
    }
  });

  it('stays open until the user explicitly clicks the close button', async () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite: vi.fn(),
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '保持当前写作内容';
    textarea.getBoundingClientRect = rect;
    const otherTextarea = document.createElement('textarea');
    otherTextarea.value = '另一个输入框';
    otherTextarea.getBoundingClientRect = rect;
    const outsideButton = document.createElement('button');
    document.body.append(textarea, otherTextarea, outsideButton);
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);

    const { launcher, panel, close, source, context } = shadowElements();
    launcher.click();
    expect(panel.style.display).toBe('block');

    outsideButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));
    outsideButton.focus();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(panel.style.display).toBe('block');

    otherTextarea.focus();
    expect(panel.style.display).toBe('block');
    expect(source.textContent).toBe('保持当前写作内容');

    context.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(panel.style.display).toBe('block');

    close.click();
    expect(panel.style.display).toBe('none');

    assistant.stop();
  });

  it('keeps page select controls usable while the assistant is open', () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite: vi.fn(),
    });
    assistant.start();
    const popover = document.createElement('div');
    popover.setAttribute('role', 'dialog');
    const textarea = document.createElement('textarea');
    textarea.value = '需要润色的内容';
    textarea.getBoundingClientRect = rect;
    const select = document.createElement('select');
    select.append(new Option('正式', 'formal'), new Option('轻松', 'casual'));
    const textareaBlur = vi.fn(() => popover.remove());
    textarea.addEventListener('blur', textareaBlur);
    popover.append(textarea, select);
    document.body.append(popover);
    textarea.focus();

    const { launcher, panel } = shadowElements();
    launcher.click();
    select.focus();
    select.value = 'casual';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.activeElement).toBe(select);
    expect(select.value).toBe('casual');
    expect(textareaBlur).not.toHaveBeenCalled();
    expect(popover.isConnected).toBe(true);
    expect(panel.style.display).toBe('block');

    assistant.stop();
  });

  it('closes the assistant when the page removes its source textarea popover', async () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite: vi.fn(),
    });
    assistant.start();
    const popover = document.createElement('div');
    popover.setAttribute('role', 'dialog');
    const textarea = document.createElement('textarea');
    textarea.value = '弹窗里的内容';
    textarea.getBoundingClientRect = rect;
    popover.append(textarea);
    document.body.append(popover);
    textarea.focus();

    const { host, launcher, panel } = shadowElements();
    launcher.click();
    expect(panel.style.display).toBe('block');
    popover.remove();

    await vi.waitFor(() => expect(panel.style.display).toBe('none'));
    expect(host.isConnected).toBe(false);

    const nextTextarea = document.createElement('textarea');
    nextTextarea.value = '下一处文字';
    nextTextarea.getBoundingClientRect = rect;
    document.body.append(nextTextarea);
    nextTextarea.focus();

    expect(host.isConnected).toBe(true);
    expect(panel.style.display).toBe('none');
    expect(launcher.style.display).toBe('flex');

    assistant.stop();
  });

  it('keeps long assistant content scrollable with the mouse wheel', () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite: vi.fn(),
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '需要润色的长内容';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();

    const elements = shadowElements();
    elements.launcher.click();
    Object.defineProperty(elements.content, 'scrollHeight', { configurable: true, value: 1_200 });
    Object.defineProperty(elements.content, 'clientHeight', { configurable: true, value: 300 });
    elements.content.scrollTop = 40;

    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      composed: true,
      deltaY: 160,
    });
    elements.content.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(true);
    expect(elements.content.scrollTop).toBe(200);

    assistant.stop();
  });

  it('scrolls the open model list instead of the panel content with the mouse wheel', () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite: vi.fn(),
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '需要润色的长内容';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();

    const elements = shadowElements();
    elements.launcher.click();
    Object.defineProperty(elements.content, 'scrollHeight', { configurable: true, value: 1_200 });
    Object.defineProperty(elements.content, 'clientHeight', { configurable: true, value: 300 });
    elements.content.scrollTop = 40;
    const modelList = elements.modelPopover.querySelector<HTMLElement>('.model-list')!;
    Object.defineProperty(modelList, 'scrollHeight', { configurable: true, value: 600 });
    Object.defineProperty(modelList, 'clientHeight', { configurable: true, value: 220 });
    // jsdom does not resolve shadow-root stylesheets; report the list's real overflow-y: auto.
    const realGetComputedStyle = window.getComputedStyle.bind(window);
    const computedStyle = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => (
      element === modelList ? ({ overflowY: 'auto' } as CSSStyleDeclaration) : realGetComputedStyle(element, pseudo)
    ));

    const scrollList = (deltaY: number) => {
      const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, deltaY });
      modelList.dispatchEvent(wheel);
      return wheel;
    };

    expect(scrollList(160).defaultPrevented).toBe(true);
    expect(modelList.scrollTop).toBe(160);
    // At the end of the list the wheel stays contained and does not move the panel.
    scrollList(1_000);
    expect(modelList.scrollTop).toBe(380);
    expect(elements.content.scrollTop).toBe(40);

    computedStyle.mockRestore();
    assistant.stop();
  });

  it('shows a check icon for two seconds after copying a rewrite result', async () => {
    const requestRewrite = vi.fn(async () => ({ text: '润色后的结果' }));
    const writeText = vi.fn(async () => undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard');
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite,
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '需要润色的内容';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);

    const elements = shadowElements();
    elements.launcher.click();
    elements.generate.click();
    await vi.waitFor(() => expect(elements.result.textContent).toBe('润色后的结果'));

    vi.useFakeTimers();
    elements.copy.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('润色后的结果');
    expect(elements.copy.dataset.copied).toBe('true');
    expect(elements.copy.getAttribute('aria-label')).toBe('已复制');
    expect(elements.copy.querySelector('path')?.getAttribute('d')).toBe('m5 12 4 4L19 6');

    vi.advanceTimersByTime(1_999);
    expect(elements.copy.dataset.copied).toBe('true');
    vi.advanceTimersByTime(1);
    expect(elements.copy.dataset.copied).toBeUndefined();
    expect(elements.copy.getAttribute('aria-label')).toBe('复制');
    expect(elements.copy.querySelector('rect')).not.toBeNull();

    vi.useRealTimers();
    assistant.stop();
    if (originalClipboard) Object.defineProperty(window.navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(window.navigator, 'clipboard');
  });

  it('keeps every rewrite from the current assistant session for comparison', async () => {
    const requestRewrite = vi.fn()
      .mockResolvedValueOnce({ text: 'First polished result' })
      .mockResolvedValueOnce({ text: 'Second polished result' });
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: en,
      requestRewrite,
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = 'alpha beta';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(0, 5);

    const elements = shadowElements();
    elements.launcher.click();
    elements.generate.click();
    await vi.waitFor(() => expect(elements.result.textContent).toBe('First polished result'));

    textarea.setSelectionRange(6, 10);
    textarea.dispatchEvent(new Event('select', { bubbles: true, composed: true }));
    elements.generate.click();
    await vi.waitFor(() => expect(elements.result.textContent).toBe('Second polished result'));

    const historySection = elements.shadow.querySelector<HTMLElement>('.history-section')!;
    const cards = [...elements.shadow.querySelectorAll<HTMLElement>('.history-card')];
    expect(historySection.style.display).toBe('block');
    expect(elements.shadow.querySelector('.history-heading')?.textContent).toBe('Rewrite history');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.querySelector('.history-source')?.textContent).toBe('alpha');
    expect(cards[0]?.querySelector('.history-result')?.textContent).toBe('First polished result');
    expect(cards[0]?.querySelector('.history-tone')?.textContent).toBe('Polish');
    expect(elements.source.textContent).toBe('beta');

    assistant.stop();
  });

  it('allows copying and inserting an earlier rewrite without removing the comparison history', async () => {
    const requestRewrite = vi.fn()
      .mockResolvedValueOnce({ text: 'FIRST' })
      .mockResolvedValueOnce({ text: 'SECOND' });
    const writeText = vi.fn(async () => undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard');
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: en,
      requestRewrite,
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = 'alpha beta';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(0, 5);

    const elements = shadowElements();
    elements.launcher.click();
    elements.generate.click();
    await vi.waitFor(() => expect(elements.result.textContent).toBe('FIRST'));
    textarea.setSelectionRange(6, 10);
    textarea.dispatchEvent(new Event('select', { bubbles: true, composed: true }));
    elements.generate.click();
    await vi.waitFor(() => expect(elements.result.textContent).toBe('SECOND'));

    const historyCard = elements.shadow.querySelector<HTMLElement>('.history-card')!;
    historyCard.querySelector<HTMLButtonElement>('.history-copy-button')!.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('FIRST'));
    historyCard.querySelector<HTMLButtonElement>('.history-insert-button')!.click();

    expect(textarea.value).toBe('FIRST beta');
    expect(elements.result.textContent).toBe('SECOND');
    expect(elements.shadow.querySelectorAll('.history-card')).toHaveLength(1);
    expect(elements.shadow.querySelector('.history-result')?.textContent).toBe('FIRST');

    assistant.stop();
    if (originalClipboard) Object.defineProperty(window.navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(window.navigator, 'clipboard');
  });

  it('clears the current rewrite history only after the assistant is closed', async () => {
    const requestRewrite = vi.fn()
      .mockResolvedValueOnce({ text: 'First result' })
      .mockResolvedValueOnce({ text: 'Second result' });
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: en,
      requestRewrite,
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = 'alpha beta';
    textarea.getBoundingClientRect = rect;
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(0, 5);

    const elements = shadowElements();
    elements.launcher.click();
    elements.generate.click();
    await vi.waitFor(() => expect(elements.result.textContent).toBe('First result'));
    textarea.setSelectionRange(6, 10);
    textarea.dispatchEvent(new Event('select', { bubbles: true, composed: true }));
    elements.generate.click();
    await vi.waitFor(() => expect(elements.shadow.querySelectorAll('.history-card')).toHaveLength(1));

    elements.close.click();
    elements.launcher.click();

    expect(elements.resultWrap.style.display).toBe('none');
    expect(elements.result.textContent).toBe('');
    expect(elements.shadow.querySelectorAll('.history-card')).toHaveLength(0);
    expect(elements.shadow.querySelector<HTMLElement>('.history-section')?.style.display).toBe('none');

    assistant.stop();
  });

  it('polishes and inserts the result into the original textarea', async () => {
    const requestRewrite = vi.fn(async () => ({ text: '这是润色后的专业表达。' }));
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite,
      createRequestId: () => 'writing-1',
    });
    assistant.start();
    const textarea = document.createElement('textarea');
    textarea.value = '这个说法不太好。';
    textarea.getBoundingClientRect = rect;
    const inputEvent = vi.fn();
    textarea.addEventListener('input', inputEvent);
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);

    const elements = shadowElements();
    elements.content.getBoundingClientRect = () => ({
      x: 0, y: 64, left: 0, top: 64, right: 460, bottom: 500,
      width: 460, height: 436, toJSON: () => ({}),
    }) as DOMRect;
    elements.resultWrap.getBoundingClientRect = () => ({
      x: 0, y: 280, left: 0, top: 280, right: 460, bottom: 460,
      width: 460, height: 180, toJSON: () => ({}),
    }) as DOMRect;
    elements.launcher.click();
    expect(elements.panel.style.display).toBe('block');
    expect(elements.source.textContent).toBe('这个说法不太好。');
    expect(elements.toneOptions).toHaveLength(4);
    expect(elements.toneOptions[0]?.getAttribute('aria-selected')).toBe('true');
    elements.tone.value = 'professional';
    elements.context.value = '用于给客户发送的邮件';
    elements.generate.click();

    await vi.waitFor(() => expect(requestRewrite).toHaveBeenCalledWith({
      requestId: 'writing-1',
      text: '这个说法不太好。',
      instruction: '用于给客户发送的邮件',
      tone: 'professional',
    }));
    await vi.waitFor(() => expect(elements.result.textContent).toBe('这是润色后的专业表达。'));
    await vi.waitFor(() => expect(elements.content.scrollTop).toBe(204));
    expect(elements.resultWrap.style.display).toBe('grid');
    expect(elements.result.tagName).toBe('DIV');
    expect(elements.result.getAttribute('contenteditable')).toBeNull();
    expect(elements.shadow.activeElement).not.toBe(elements.result);
    expect(elements.retry.textContent).toBe('重试');
    expect(elements.copy.getAttribute('aria-label')).toBe('复制');

    elements.insert.click();
    expect(textarea.value).toBe('这是润色后的专业表达。');
    expect(inputEvent).toHaveBeenCalledOnce();
    expect(textarea.selectionStart).toBe(textarea.value.length);

    assistant.stop();
  });

  it('picks the tone from a dropdown with mouse and keyboard', () => {
    const assistant = new TextareaWritingAssistant({
      document,
      window,
      messages: zhCN,
      requestRewrite: vi.fn(),
      loadModels: vi.fn(async () => ({ model: 'm1', models: ['m1', 'm2'] })),
    });
    assistant.start();
    try {
      const textarea = document.createElement('textarea');
      textarea.value = '这个说法不太好。';
      document.body.append(textarea);
      textarea.focus();
      textarea.setSelectionRange(0, textarea.value.length);
      const elements = shadowElements();
      elements.launcher.click();

      const row = elements.shadow.querySelector<HTMLElement>('.picker-row')!;
      expect([...row.children].map((child) => child.className)).toEqual(['tone-section', 'model-section']);
      expect(elements.shadow.querySelector('.tone-label')?.classList.contains('sr-only')).toBe(true);
      expect(elements.shadow.querySelector('.model-label')?.classList.contains('sr-only')).toBe(true);
      expect(elements.toneTrigger.querySelector('svg.tone-icon, .tone-icon')).toBeNull();
      expect(elements.toneTrigger.textContent).toContain(zhCN.writingTonePolish);
      expect(elements.toneTrigger.getAttribute('aria-expanded')).toBe('false');
      expect(elements.tonePopover.dataset.open).toBeUndefined();

      elements.toneTrigger.click();
      expect(elements.tonePopover.dataset.open).toBe('true');
      expect(elements.toneTrigger.getAttribute('aria-expanded')).toBe('true');
      elements.toneOptions[3]!.click();
      expect(elements.tone.value).toBe('concise');
      expect(elements.toneTrigger.textContent).toContain(zhCN.writingToneConcise);
      expect(elements.toneOptions[3]!.getAttribute('aria-selected')).toBe('true');
      expect(elements.tonePopover.dataset.open).toBeUndefined();

      elements.toneTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(elements.tonePopover.dataset.open).toBe('true');
      expect(elements.toneTrigger.getAttribute('aria-activedescendant')).toBe('chrome-ai-writing-tone-option-concise');
      elements.toneTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      elements.toneTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      elements.toneTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(elements.tone.value).toBe('professional');
      expect(elements.tonePopover.dataset.open).toBeUndefined();

      elements.toneTrigger.click();
      elements.toneTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(elements.tonePopover.dataset.open).toBeUndefined();
      expect(elements.tone.value).toBe('professional');

      elements.toneTrigger.click();
      elements.source.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      expect(elements.tonePopover.dataset.open).toBeUndefined();
    } finally {
      assistant.stop();
    }
  });
});

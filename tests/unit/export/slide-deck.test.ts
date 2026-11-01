import { describe, expect, it } from 'vitest';
import {
  deckFileName,
  MAX_SLIDE_BULLETS,
  parseSlideDeck,
  replaceSlideDeckWithMarkdown,
  splitSlideDeck,
} from '../../../core/export/slide-deck';

const outline = JSON.stringify({
  title: '季度回顾',
  subtitle: '2026 Q3',
  slides: [
    { title: '背景', bullets: ['目标', '  ', '范围'], notes: '先讲背景' },
    { title: '下一步' },
  ],
});

describe('slide deck outline', () => {
  it('splits the ```slides block from the surrounding Markdown and validates it', () => {
    const split = splitSlideDeck(`这是季度回顾的演示文稿。\n\n\`\`\`slides\n${outline}\n\`\`\`\n\n需要调整吗？`);
    expect(split?.open).toBe(false);
    expect(split?.before).toBe('这是季度回顾的演示文稿。');
    expect(split?.after).toBe('需要调整吗？');
    expect(split?.deck).toEqual({
      title: '季度回顾',
      subtitle: '2026 Q3',
      slides: [
        { title: '背景', bullets: ['目标', '范围'], notes: '先讲背景' },
        { title: '下一步', bullets: [], notes: undefined },
      ],
    });
  });

  it('treats an unclosed block as still streaming', () => {
    const split = splitSlideDeck('主题\n\n```slides\n{"title": "季');
    expect(split).toMatchObject({ before: '主题', open: true, deck: undefined });
  });

  it('accepts a ```json block only when it holds slides, and ignores other code', () => {
    expect(splitSlideDeck('```json\n{"a": 1}\n```')).toBeUndefined();
    expect(splitSlideDeck('```ts\nconst slides = 1\n```')).toBeUndefined();
    expect(splitSlideDeck(`\`\`\`json\n${outline}\n\`\`\``)?.deck?.title).toBe('季度回顾');
  });

  it('rejects malformed JSON or decks without slides, and caps bullets', () => {
    expect(parseSlideDeck('{"title": "x", "slides": [}')).toBeUndefined();
    expect(parseSlideDeck('{"title": "x", "slides": []}')).toBeUndefined();
    expect(parseSlideDeck('{"title": "", "slides": [{"title": "a"}]}')).toBeUndefined();
    const many = parseSlideDeck(JSON.stringify({ title: 't', slides: [{ title: 's', bullets: Array.from({ length: 12 }, (_, i) => `b${i}`) }] }));
    expect(many?.slides[0]?.bullets).toHaveLength(MAX_SLIDE_BULLETS);
  });

  it('renders the outline as Markdown for printing and builds safe file names', () => {
    const markdown = replaceSlideDeckWithMarkdown(`开头\n\n\`\`\`slides\n${outline}\n\`\`\``);
    expect(markdown).toBe('开头\n\n# 季度回顾\n\n2026 Q3\n\n## 背景\n- 目标\n- 范围\n\n## 下一步');
    expect(replaceSlideDeckWithMarkdown('普通回答')).toBe('普通回答');
    expect(deckFileName('A/B: "Plan"?', 'pptx')).toBe('A B Plan.pptx');
    expect(deckFileName('  ', 'pptx')).toBe('slides.pptx');
  });
});

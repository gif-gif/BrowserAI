import { describe, expect, it } from 'vitest';
import { fixCjkEmphasis } from '../../../shared/writing-assistant/cjk-emphasis';

describe('fixCjkEmphasis', () => {
  it('moves trailing punctuation outside bold so it closes before CJK text', () => {
    expect(fixCjkEmphasis('**摘要：**正文')).toBe('**摘要**：正文');
    expect(fixCjkEmphasis('前面 **说明：**原文只有一个字')).toBe('前面 **说明**：原文只有一个字');
  });

  it('leaves emphasis that already parses, and code, unchanged', () => {
    expect(fixCjkEmphasis('**摘要**正文')).toBe('**摘要**正文');
    expect(fixCjkEmphasis('**摘要：** 正文')).toBe('**摘要：** 正文');
    expect(fixCjkEmphasis('`**a：**b`')).toBe('`**a：**b`');
    expect(fixCjkEmphasis('```\n**a：**b\n```')).toBe('```\n**a：**b\n```');
  });
});

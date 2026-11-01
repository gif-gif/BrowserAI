import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildPptx } from '../../../core/export/pptx-builder';

describe('buildPptx', () => {
  it('writes a title slide plus one slide per outline entry with notes', async () => {
    const blob = await buildPptx({
      title: '季度回顾',
      subtitle: '2026 Q3',
      slides: [
        { title: '背景', bullets: ['目标', '范围'], notes: '先讲背景' },
        { title: '下一步', bullets: [] },
      ],
    }, '#0b57d0');

    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slides).toHaveLength(3);
    expect(await zip.file('ppt/slides/slide1.xml')?.async('string')).toContain('季度回顾');
    const second = await zip.file('ppt/slides/slide2.xml')?.async('string');
    expect(second).toContain('背景');
    expect(second).toContain('范围');
    expect(second).toContain('0B57D0');
    const notes = Object.keys(zip.files).filter((name) => name.startsWith('ppt/notesSlides/') && name.endsWith('.xml'));
    const notesText = await Promise.all(notes.map((name) => zip.file(name)!.async('string')));
    expect(notesText.join('')).toContain('先讲背景');
  });
});

import { describe, expect, it } from 'vitest';
import { en } from '../../../shared/i18n/en';
import { zhCN } from '../../../shared/i18n/zh-CN';
import { zhTW } from '../../../shared/i18n/zh-TW';
import { findCatalogSkill, localizeCatalog, matchesSkillQuery } from '../../../shared/skills/skill-catalog';
import { validateSkill } from '../../../shared/skills/skill-store';

describe('skill catalog', () => {
  it.each([['zh-CN', zhCN], ['zh-TW', zhTW], ['en', en]])('gives every %s catalog skill a name that can be typed after “/”', (_, messages) => {
    const catalog = localizeCatalog(messages.catalogSkills);
    expect(catalog).toHaveLength(53);
    for (const skill of catalog) expect(skill.prompt.trim()).not.toBe('');
    for (const skill of catalog) expect(validateSkill(skill, [])).toBeUndefined();
    expect(new Set(catalog.map((skill) => skill.name.toLocaleLowerCase())).size).toBe(catalog.length);
  });

  it('finds added skills by name regardless of case and matches search queries', () => {
    const catalog = localizeCatalog(en.catalogSkills);
    expect(findCatalogSkill(catalog, 'executivesummary')?.id).toBe('executive-summary');
    expect(matchesSkillQuery(' TRANS ', 'Translate')).toBe(true);
    expect(matchesSkillQuery('', 'anything')).toBe(true);
    expect(matchesSkillQuery('xyz', 'Translate', 'desc')).toBe(false);
  });
});

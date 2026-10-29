import { describe, expect, it } from 'vitest';
import { filterSkills, normalizeSkills, upsertSkill, validateSkill } from '../../../shared/skills/skill-store';
import type { Skill } from '../../../shared/types/skill';

const skills: Skill[] = [
  { id: 'a', name: 'hi', prompt: '打招呼', createdAt: 1, updatedAt: 1 },
  { id: 'b', name: 'Test', prompt: '写测试', createdAt: 2, updatedAt: 2 },
];

describe('skill store', () => {
  it('validates names that can be typed after “/”', () => {
    expect(validateSkill({ name: ' ', prompt: 'x' }, skills)).toBe('nameRequired');
    expect(validateSkill({ name: 'a b', prompt: 'x' }, skills)).toBe('nameInvalid');
    expect(validateSkill({ name: 'a/b', prompt: 'x' }, skills)).toBe('nameInvalid');
    expect(validateSkill({ name: 'test', prompt: 'x' }, skills)).toBe('nameDuplicate');
    expect(validateSkill({ name: 'test', prompt: 'x' }, skills, 'b')).toBeUndefined();
    expect(validateSkill({ name: '周报', prompt: '  ' }, skills)).toBe('promptRequired');
    expect(validateSkill({ name: '周报', prompt: '整理' }, skills)).toBeUndefined();
  });

  it('adds and updates skills', () => {
    const added = upsertSkill(skills, { name: ' 周报 ', prompt: ' 整理 ' }, 10, () => 'c');
    expect(added.skill).toEqual({ id: 'c', name: '周报', prompt: '整理', createdAt: 10, updatedAt: 10 });
    expect(added.skills).toHaveLength(3);

    const updated = upsertSkill(added.skills, { id: 'a', name: 'hello', prompt: '你好' }, 20, () => 'unused');
    expect(updated.skill).toEqual({ id: 'a', name: 'hello', prompt: '你好', createdAt: 1, updatedAt: 20 });
    expect(updated.skills.map((skill) => skill.name)).toEqual(['hello', 'Test', '周报']);
  });

  it('filters case-insensitively and ignores malformed stored values', () => {
    expect(filterSkills(skills, 'te').map((skill) => skill.id)).toEqual(['b']);
    expect(filterSkills(skills, '')).toHaveLength(2);
    expect(normalizeSkills('nope')).toEqual([]);
    expect(normalizeSkills([skills[0], { id: 'x' }, null])).toEqual([skills[0]]);
  });
});

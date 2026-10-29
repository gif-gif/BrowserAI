import { STORAGE_KEYS } from '../constants/storage-keys';
import {
  MAX_SKILL_NAME_LENGTH,
  MAX_SKILL_PROMPT_LENGTH,
  MAX_SKILLS,
  type Skill,
} from '../types/skill';

export type SkillValidationError = 'nameRequired' | 'nameInvalid' | 'nameDuplicate' | 'promptRequired' | 'limitReached';

function isSkill(value: unknown): value is Skill {
  const candidate = value as Partial<Skill> | null;
  return typeof candidate?.id === 'string' && candidate.id.length > 0
    && typeof candidate.name === 'string' && candidate.name.length > 0
    && typeof candidate.prompt === 'string'
    && typeof candidate.createdAt === 'number'
    && typeof candidate.updatedAt === 'number';
}

/** Drops malformed entries so a damaged storage value never breaks the composer. */
export function normalizeSkills(value: unknown): Skill[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isSkill).slice(0, MAX_SKILLS);
}

/** Names are typed after “/”, so they cannot contain whitespace or another slash. */
export function validateSkill(
  draft: { name: string; prompt: string },
  skills: Skill[],
  editingId?: string,
): SkillValidationError | undefined {
  const name = draft.name.trim();
  if (!name) return 'nameRequired';
  if (/[\s/]/.test(name) || name.length > MAX_SKILL_NAME_LENGTH) return 'nameInvalid';
  const lower = name.toLocaleLowerCase();
  if (skills.some((skill) => skill.id !== editingId && skill.name.toLocaleLowerCase() === lower)) return 'nameDuplicate';
  if (!draft.prompt.trim()) return 'promptRequired';
  if (!editingId && skills.length >= MAX_SKILLS) return 'limitReached';
  return undefined;
}

export function filterSkills(skills: Skill[], query: string): Skill[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return skills;
  return skills.filter((skill) => skill.name.toLocaleLowerCase().includes(needle));
}

/** Adds a new skill or replaces the one with the same id. */
export function upsertSkill(
  skills: Skill[],
  draft: { id?: string; name: string; prompt: string },
  now: number,
  createId: () => string,
): { skills: Skill[]; skill: Skill } {
  const name = draft.name.trim();
  const prompt = draft.prompt.trim().slice(0, MAX_SKILL_PROMPT_LENGTH);
  const existing = draft.id ? skills.find((skill) => skill.id === draft.id) : undefined;
  if (existing) {
    const skill = { ...existing, name, prompt, updatedAt: now };
    return { skills: skills.map((item) => (item.id === skill.id ? skill : item)), skill };
  }
  const skill: Skill = { id: createId(), name, prompt, createdAt: now, updatedAt: now };
  return { skills: [...skills, skill], skill };
}

export async function loadSkills(): Promise<Skill[]> {
  if (typeof browser === 'undefined' || !browser.storage?.local?.get) return [];
  const stored = await browser.storage.local.get(STORAGE_KEYS.skills);
  return normalizeSkills(stored[STORAGE_KEYS.skills]);
}

export async function saveSkills(skills: Skill[]): Promise<void> {
  if (typeof browser === 'undefined' || !browser.storage?.local?.set) return;
  await browser.storage.local.set({ [STORAGE_KEYS.skills]: skills });
}

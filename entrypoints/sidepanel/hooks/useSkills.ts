import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../../../shared/constants/storage-keys';
import { loadSkills, normalizeSkills, saveSkills, upsertSkill } from '../../../shared/skills/skill-store';
import type { Skill } from '../../../shared/types/skill';

function createSkillId(): string {
  return `skill-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

/** User-defined “/” skills, kept in chrome.storage.local and synced across open panels. */
export function useSkills(initialSkills?: Skill[]) {
  const [skills, setSkills] = useState<Skill[]>(initialSkills ?? []);
  const skillsRef = useRef(skills);
  skillsRef.current = skills;

  useEffect(() => {
    if (initialSkills) return undefined;
    let active = true;
    void loadSkills().then((loaded) => { if (active) setSkills(loaded); }).catch(() => undefined);

    const storageEvents = typeof browser === 'undefined' ? undefined : browser.storage?.onChanged;
    if (!storageEvents) return () => { active = false; };
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'local' || !(STORAGE_KEYS.skills in changes)) return;
      setSkills(normalizeSkills(changes[STORAGE_KEYS.skills]?.newValue));
    };
    storageEvents.addListener(onChanged);
    return () => {
      active = false;
      storageEvents.removeListener(onChanged);
    };
  }, [initialSkills]);

  const persist = useCallback(async (next: Skill[]) => {
    const previous = skillsRef.current;
    skillsRef.current = next;
    setSkills(next);
    try {
      await saveSkills(next);
    } catch (error) {
      skillsRef.current = previous;
      setSkills(previous);
      throw error;
    }
  }, []);

  const save = useCallback(async (draft: { id?: string; name: string; prompt: string }) => {
    const result = upsertSkill(skillsRef.current, draft, Date.now(), createSkillId);
    await persist(result.skills);
    return result.skill;
  }, [persist]);

  const remove = useCallback(async (id: string) => {
    await persist(skillsRef.current.filter((skill) => skill.id !== id));
  }, [persist]);

  return { skills, save, remove };
}

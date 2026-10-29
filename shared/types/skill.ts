export const MAX_SKILLS = 100;
export const MAX_SKILL_NAME_LENGTH = 40;
export const MAX_SKILL_PROMPT_LENGTH = 8_000;

/** A user-defined instruction invoked by typing “/name” in the composer. */
export interface Skill {
  id: string;
  name: string;
  prompt: string;
  createdAt: number;
  updatedAt: number;
}

/** What travels with a chat turn: the skill as it was when the user sent it. */
export interface SkillInvocation {
  name: string;
  prompt: string;
}

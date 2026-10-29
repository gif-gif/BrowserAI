/** Left-menu sections of the settings page; each is also its URL hash (options.html#skills). */
export const SETTINGS_SECTIONS = ['general', 'models', 'skills', 'your-skills'] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Top-level menu items; 技能 expands into 浏览技能 (#skills) and 您的技能 (#your-skills). */
export const SETTINGS_MENU = ['general', 'models', 'skills'] as const;

export const SKILL_SUBSECTIONS = ['skills', 'your-skills'] as const satisfies readonly SettingsSection[];

/** Hash the side panel’s “Manage skills” link opens the settings page with. */
export const SKILL_SETTINGS_ANCHOR: SettingsSection = 'your-skills';

export function isSettingsSection(value: string): value is SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

export function isSkillSection(section: SettingsSection): boolean {
  return (SKILL_SUBSECTIONS as readonly string[]).includes(section);
}

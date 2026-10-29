/**
 * Built-in skills offered under 浏览技能, mirroring the skills Chrome offers under “Gemini in Chrome”
 * (chrome://skills/browse). Names, descriptions and prompts live in shared/i18n/skills.
 */
export const SKILL_CATEGORIES = ['writing', 'entertainment', 'learning', 'understanding', 'research', 'shopping'] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const CATALOG_SKILL_IDS = [
  'executive-summary',
  'rewrite-with-a-friendly-tone',
  'find-synonyms',
  'correct-grammar',
  'shorten-text',
  'draft-a-professional-email',
  'suggest-replies',
  'translate-text',
  'explain-slang-or-jargon',
  'hype-it-up',
  'fun-facts',
  'explain-something-in-character',
  'dramatize-content',
  'learn-with-flashcards',
  'make-a-quiz',
  'deep-questions',
  'study-guide',
  'generate-citations',
  'break-it-down',
  'protein-max',
  'meal-planner',
  'gift-concierge',
  'summarize-as-text',
  'explain-simply',
  'create-an-outline',
  'action-items',
  'quotes',
  'build-timeline',
  'opposing-view',
  'summarize-as-table',
  'check-reading-level',
  'where-does-the-time-go',
  'whats-in-this',
  'check-job-fit',
  'prep-for-today',
  'prep-for-meeting',
  'research-a-company',
  'weekly-work-review',
  'buying-advice',
  'summarize-reviews',
  'identify-specs',
  'price-per-unit',
  'check-returns',
  'sizing-help',
  'check-warranty',
  'rate-as-gift',
  'compare-open-tabs',
  'make-grocery-list',
  'shop-for-clothes-and-accessories',
  'summarize-page',
  'explain-page',
  'translate-page',
  'analyze-tech-stack',
] as const;

export type CatalogSkillId = (typeof CATALOG_SKILL_IDS)[number];

export interface CatalogSkillMeta {
  id: CatalogSkillId;
  /** Chrome's own featured picks (“由 Chrome 选择”) have no category and only show under 精选技能. */
  category?: SkillCategory;
  emoji: string;
}

/**
 * Order of the 精选技能 cards. The page skills (总结, 解释, 翻译, 分析技术栈) lead, followed by
 * Chrome's own picks; listed skills keep their category, so they still appear under 浏览技能.
 */
export const FEATURED_SKILL_IDS: readonly CatalogSkillId[] = [
  'summarize-page',
  'explain-page',
  'translate-page',
  'analyze-tech-stack',
  'protein-max',
  'meal-planner',
  'gift-concierge',
];

export const SKILL_CATALOG: readonly CatalogSkillMeta[] = [
  { id: 'executive-summary', category: 'writing', emoji: '👔' },
  { id: 'rewrite-with-a-friendly-tone', category: 'writing', emoji: '🤝' },
  { id: 'find-synonyms', category: 'writing', emoji: '🎯' },
  { id: 'correct-grammar', category: 'writing', emoji: '🩹' },
  { id: 'shorten-text', category: 'writing', emoji: '🗜️' },
  { id: 'draft-a-professional-email', category: 'writing', emoji: '📧' },
  { id: 'suggest-replies', category: 'writing', emoji: '🚦' },
  { id: 'translate-text', category: 'writing', emoji: '🌐' },
  { id: 'translate-page', category: 'writing', emoji: '🔤' },
  { id: 'explain-slang-or-jargon', category: 'writing', emoji: '🧢' },
  { id: 'hype-it-up', category: 'entertainment', emoji: '📣' },
  { id: 'fun-facts', category: 'entertainment', emoji: '🥂' },
  { id: 'explain-something-in-character', category: 'entertainment', emoji: '🎭' },
  { id: 'dramatize-content', category: 'entertainment', emoji: '🎬' },
  { id: 'learn-with-flashcards', category: 'learning', emoji: '📇' },
  { id: 'make-a-quiz', category: 'learning', emoji: '❓' },
  { id: 'deep-questions', category: 'learning', emoji: '🪞' },
  { id: 'study-guide', category: 'learning', emoji: '🗺️' },
  { id: 'generate-citations', category: 'learning', emoji: '🔖' },
  { id: 'break-it-down', category: 'learning', emoji: '👩‍🏫' },
  { id: 'protein-max', emoji: '💪' },
  { id: 'meal-planner', emoji: '🍽️' },
  { id: 'gift-concierge', emoji: '🛎️' },
  { id: 'summarize-page', category: 'understanding', emoji: '🧾' },
  { id: 'explain-page', category: 'understanding', emoji: '💡' },
  { id: 'summarize-as-text', category: 'understanding', emoji: '📝' },
  { id: 'explain-simply', category: 'understanding', emoji: '👶' },
  { id: 'create-an-outline', category: 'understanding', emoji: '🏗️' },
  { id: 'action-items', category: 'understanding', emoji: '✅' },
  { id: 'quotes', category: 'understanding', emoji: '💬' },
  { id: 'build-timeline', category: 'understanding', emoji: '⏳' },
  { id: 'opposing-view', category: 'understanding', emoji: '🤺' },
  { id: 'summarize-as-table', category: 'understanding', emoji: '📊' },
  { id: 'check-reading-level', category: 'understanding', emoji: '🎓' },
  { id: 'where-does-the-time-go', category: 'understanding', emoji: '⏱️' },
  { id: 'whats-in-this', category: 'understanding', emoji: '📝' },
  { id: 'check-job-fit', category: 'research', emoji: '🧤' },
  { id: 'prep-for-today', category: 'research', emoji: '🌅' },
  { id: 'prep-for-meeting', category: 'research', emoji: '💼' },
  { id: 'research-a-company', category: 'research', emoji: '🏢' },
  { id: 'analyze-tech-stack', category: 'research', emoji: '🧰' },
  { id: 'weekly-work-review', category: 'research', emoji: '🏁' },
  { id: 'buying-advice', category: 'shopping', emoji: '🤔' },
  { id: 'summarize-reviews', category: 'shopping', emoji: '⭐' },
  { id: 'identify-specs', category: 'shopping', emoji: '📏' },
  { id: 'price-per-unit', category: 'shopping', emoji: '🏷️' },
  { id: 'check-returns', category: 'shopping', emoji: '↩️' },
  { id: 'sizing-help', category: 'shopping', emoji: '👕' },
  { id: 'check-warranty', category: 'shopping', emoji: '🛡️' },
  { id: 'rate-as-gift', category: 'shopping', emoji: '🎁' },
  { id: 'compare-open-tabs', category: 'shopping', emoji: '🆚' },
  { id: 'make-grocery-list', category: 'shopping', emoji: '📋' },
  { id: 'shop-for-clothes-and-accessories', category: 'shopping', emoji: '👕' },
];

export interface CatalogSkillText {
  name: string;
  description: string;
  prompt: string;
}

export interface CatalogSkill extends CatalogSkillMeta, CatalogSkillText {}

export function localizeCatalog(texts: Record<CatalogSkillId, CatalogSkillText>): CatalogSkill[] {
  return SKILL_CATALOG.map((meta) => ({ ...meta, ...texts[meta.id] }));
}

/** Featured skills in FEATURED_SKILL_IDS order, keeping only those present in the given (filtered) catalog. */
export function featuredSkills<T extends { id: CatalogSkillId }>(catalog: T[]): T[] {
  return FEATURED_SKILL_IDS.flatMap((id) => catalog.filter((skill) => skill.id === id));
}

/** Matches catalog skills by name (case-insensitive), the same rule that keeps “/” names unique. */
export function findCatalogSkill<T extends { name: string }>(catalog: T[], name: string): T | undefined {
  const lower = name.toLocaleLowerCase();
  return catalog.find((skill) => skill.name.toLocaleLowerCase() === lower);
}

/** Case-insensitive match on any of the given fields; an empty query keeps everything. */
export function matchesSkillQuery(query: string, ...fields: string[]): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return fields.some((field) => field.toLocaleLowerCase().includes(needle));
}

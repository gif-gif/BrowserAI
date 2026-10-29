import { useEffect, useMemo, useRef, useState } from 'react';
import { SkillEditorDialog, type SkillDraft } from '../composer/SkillEditorDialog';
import { useSkills } from '../../entrypoints/sidepanel/hooks/useSkills';
import { useI18n } from '../../shared/i18n/I18nProvider';
import {
  featuredSkills,
  findCatalogSkill,
  localizeCatalog,
  matchesSkillQuery,
  SKILL_CATEGORIES,
  type CatalogSkill,
  type SkillCategory,
} from '../../shared/skills/skill-catalog';
import { validateSkill } from '../../shared/skills/skill-store';
import type { Skill } from '../../shared/types/skill';

function BoltIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11.2 2.5 4.8 11h4.6l-1 6.5L15.2 9h-4.6l.6-6.5Z" /></svg>;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m12.8 4.2 3 3-8.6 8.6-3.7.7.7-3.7 8.6-8.6Z" />
      <path d="m11.3 5.7 3 3" />
    </svg>
  );
}

function PlusIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.5v11M4.5 10h11" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="8.8" cy="8.8" r="5.3" />
      <path d="m12.8 12.8 4 4" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="4.5" r="1.3" />
      <circle cx="10" cy="10" r="1.3" />
      <circle cx="10" cy="15.5" r="1.3" />
    </svg>
  );
}

/** Search box shared by both skill pages; it filters the cards below it. */
export function SkillSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { messages } = useI18n();
  return (
    <label className="skill-search">
      <SearchIcon />
      <input type="search" value={value} placeholder={messages.searchSkills} aria-label={messages.searchSkills} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function useCatalog(): CatalogSkill[] {
  const { messages } = useI18n();
  return useMemo(() => localizeCatalog(messages.catalogSkills), [messages]);
}

/** 浏览技能: featured cards, then the full catalog filtered by category; “添加” copies a skill into 您的技能. */
export function BrowseSkills({ skills: initialSkills, query = '' }: { skills?: Skill[]; query?: string }) {
  const { messages } = useI18n();
  const { skills, save } = useSkills(initialSkills);
  const catalog = useCatalog();
  const [category, setCategory] = useState<SkillCategory>();
  const [error, setError] = useState<string>();

  const matching = catalog.filter((skill) => matchesSkillQuery(query, skill.name, skill.description));
  const featured = featuredSkills(matching);
  const browsable = category ? matching.filter((skill) => skill.category === category) : matching;

  async function add(skill: CatalogSkill) {
    setError(undefined);
    const invalid = validateSkill(skill, skills);
    if (invalid) {
      setError(invalid === 'limitReached' ? messages.skillLimitReached : messages.skillSaveFailed);
      return;
    }
    try {
      await save({ name: skill.name, prompt: skill.prompt });
    } catch {
      setError(messages.skillSaveFailed);
    }
  }

  function renderCard(skill: CatalogSkill) {
    const added = Boolean(findCatalogSkill(skills, skill.name));
    return (
      <li key={skill.id} className="skill-card skill-card--catalog">
        <div className={`skill-card__art skill-card__art--${skill.category ?? 'featured'}`} aria-hidden="true">
          <span>{skill.emoji}</span>
        </div>
        <div className="skill-card__title">
          <span className="skill-card__emoji" aria-hidden="true">{skill.emoji}</span>
          <strong>{skill.name}</strong>
        </div>
        <p className="skill-card__provider">{messages.skillProvider}<span>{messages.skillProviderName}</span></p>
        <p className="skill-card__body">{skill.description}</p>
        <div className="skill-card__actions">
          {added ? (
            <span className="skill-card__added"><CheckIcon />{messages.catalogSkillAdded}</span>
          ) : (
            <button type="button" className="skill-card__action" aria-label={messages.addCatalogSkill(skill.name)} onClick={() => { void add(skill); }}>
              <PlusIcon />
              {messages.addSkillShort}
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="skill-page">
      {error ? <p className="skill-page__error" role="alert">{error}</p> : null}
      {featured.length > 0 ? (
        <section className="skill-page__section" aria-labelledby="featured-skills-title">
          <h3 id="featured-skills-title" className="skill-page__heading">{messages.featuredSkills}</h3>
          <ul className="skill-grid">{featured.map(renderCard)}</ul>
        </section>
      ) : null}
      <section className="skill-page__section" aria-labelledby="browse-skills-title">
        <h3 id="browse-skills-title" className="skill-page__heading">{messages.builtInSkills}</h3>
        <div className="skill-chips" role="group" aria-label={messages.builtInSkills}>
          <button type="button" className="skill-chip" aria-pressed={!category} onClick={() => setCategory(undefined)}>
            {!category ? <CheckIcon /> : null}
            {messages.skillCategoryAll}
          </button>
          {SKILL_CATEGORIES.map((id) => (
            <button key={id} type="button" className="skill-chip" aria-pressed={category === id} onClick={() => setCategory(category === id ? undefined : id)}>
              {category === id ? <CheckIcon /> : <PlusIcon />}
              {messages.skillCategories[id]}
            </button>
          ))}
        </div>
        {browsable.length === 0 ? <p className="skill-page__empty">{messages.noMatchingSkills}</p> : (
          <ul className="skill-grid">{browsable.map(renderCard)}</ul>
        )}
      </section>
    </div>
  );
}

function SkillCardMenu({ skill, onEdit, onDelete }: { skill: Skill; onEdit: () => void; onDelete: () => void }) {
  const { messages } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function close(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="skill-card__menu">
      <button
        type="button"
        className="skill-card__more"
        aria-label={messages.skillMoreActions(skill.name)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreIcon />
      </button>
      {open ? (
        <div className="skill-card__popover" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }}>{messages.editSkillTitle}</button>
          <button type="button" role="menuitem" className="skill-card__delete" onClick={() => { setOpen(false); onDelete(); }}>{messages.deleteSkill}</button>
        </div>
      ) : null}
    </div>
  );
}

/** 您的技能: the user’s “/” skills as cards with 修改 and a ⋮ menu, plus 添加 in the header. */
export function YourSkills({ skills: initialSkills, query = '' }: { skills?: Skill[]; query?: string }) {
  const { messages } = useI18n();
  const { skills, save, remove } = useSkills(initialSkills);
  const catalog = useCatalog();
  const [editor, setEditor] = useState<SkillDraft>();
  const visible = skills.filter((skill) => matchesSkillQuery(query, skill.name, skill.prompt));
  const edit = (skill: Skill) => setEditor({ id: skill.id, name: skill.name, prompt: skill.prompt });

  return (
    <section className="skill-page" aria-labelledby="your-skills-title">
      <div className="skill-page__header">
        <div className="skill-page__copy">
          <h3 id="your-skills-title" className="skill-page__heading">{messages.yourSkills}</h3>
          <p>{messages.skillSettingsDescription}</p>
        </div>
        <button type="button" className="skill-page__add" aria-label={messages.addSkill} onClick={() => setEditor({ name: '', prompt: '' })}>
          <PlusIcon />
          {messages.addSkillShort}
        </button>
      </div>
      {skills.length === 0 ? <p className="skill-page__empty">{messages.noSkills}</p> : null}
      {skills.length > 0 && visible.length === 0 ? <p className="skill-page__empty">{messages.noMatchingSkills}</p> : null}
      {visible.length > 0 ? (
        <ul className="skill-grid">
          {visible.map((skill) => {
            const emoji = findCatalogSkill(catalog, skill.name)?.emoji;
            return (
              <li key={skill.id} className="skill-card">
                <div className="skill-card__title">
                  {emoji ? <span className="skill-card__emoji" aria-hidden="true">{emoji}</span> : <span className="skill-card__bolt" aria-hidden="true"><BoltIcon /></span>}
                  <strong>{skill.name}</strong>
                  <SkillCardMenu skill={skill} onEdit={() => edit(skill)} onDelete={() => { void remove(skill.id).catch(() => undefined); }} />
                </div>
                <p className="skill-card__body skill-card__body--prompt" title={skill.prompt}>{skill.prompt}</p>
                <div className="skill-card__actions">
                  <button type="button" className="skill-card__action" aria-label={messages.editSkill(skill.name)} onClick={() => edit(skill)}>
                    <PencilIcon />
                    {messages.editSkillShort}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {editor ? (
        <SkillEditorDialog
          draft={editor}
          skills={skills}
          onSave={async (draft) => { await save(draft); }}
          onDelete={remove}
          onClose={() => setEditor(undefined)}
        />
      ) : null}
    </section>
  );
}

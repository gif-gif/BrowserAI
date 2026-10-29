import { useEffect, useRef } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider';
import type { Skill } from '../../shared/types/skill';

interface SkillPickerProps {
  id: string;
  skills: Skill[];
  /** Index into the skills, or skills.length for the “Add skill” row. */
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (skill: Skill) => void;
  onEdit: (skill: Skill) => void;
  onAdd: () => void;
}

export function skillOptionId(pickerId: string, skillId: string) {
  return `${pickerId}-skill-${skillId}`;
}

export function addSkillOptionId(pickerId: string) {
  return `${pickerId}-add`;
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M11.2 2.5 4.8 11h4.6l-1 6.5L15.2 9h-4.6l.6-6.5Z" />
    </svg>
  );
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

/** The “/” popup: saved skills, an edit button on the highlighted one, and “Add skill”. */
export function SkillPicker({ id, skills, activeIndex, onHover, onSelect, onEdit, onAdd }: SkillPickerProps) {
  const { messages } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = skills[activeIndex];
    const optionId = active ? skillOptionId(id, active.id) : addSkillOptionId(id);
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId)}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, id, skills]);

  return (
    <div className="skill-picker" role="presentation">
      <div ref={listRef} id={id} className="skill-picker__list" role="listbox" aria-label={messages.skillPicker}>
        {skills.map((skill, index) => (
          <div
            key={skill.id}
            id={skillOptionId(id, skill.id)}
            role="option"
            aria-selected={index === activeIndex}
            title={skill.prompt}
            className={`skill-picker__option ${index === activeIndex ? 'skill-picker__option--active' : ''}`.trim()}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(event) => {
              // Keep focus in the textarea so the draft caret is preserved.
              event.preventDefault();
              onSelect(skill);
            }}
          >
            <span className="skill-picker__icon" aria-hidden="true"><BoltIcon /></span>
            <span className="skill-picker__name">{skill.name}</span>
            <button
              type="button"
              className="skill-picker__edit"
              aria-label={messages.editSkill(skill.name)}
              title={messages.editSkillTitle}
              tabIndex={-1}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onEdit(skill);
              }}
            >
              <PencilIcon />
            </button>
          </div>
        ))}
        {skills.length > 0 ? <div className="skill-picker__divider" role="separator" /> : null}
        <div
          id={addSkillOptionId(id)}
          role="option"
          aria-selected={activeIndex === skills.length}
          className={`skill-picker__option skill-picker__option--add ${activeIndex === skills.length ? 'skill-picker__option--active' : ''}`.trim()}
          onMouseEnter={() => onHover(skills.length)}
          onMouseDown={(event) => {
            event.preventDefault();
            onAdd();
          }}
        >
          <span className="skill-picker__icon skill-picker__icon--plain" aria-hidden="true"><PlusIcon /></span>
          <span className="skill-picker__name">{messages.addSkill}</span>
        </div>
      </div>
    </div>
  );
}

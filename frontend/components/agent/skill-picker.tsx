import { Fragment } from 'react';

import {
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
} from '@/components/ui/menu';
import { skillGroupLabel } from '@/lib/agent/vocabulary';
import { type AgentSkill } from '@/lib/api/agent';
import { useAgentCatalog } from '@/components/agent/use-agent-catalog';

const AUTOMATIC = '';
const INHERIT = '__inherit';

/** The skills, shared by the picker and the message skill labels. */
export function useSkillCatalog(): AgentSkill[] {
  return useAgentCatalog().skills;
}

export function skillLabel(skills: AgentSkill[], skillId: string | null): string | null {
  if (!skillId) return null;
  return skills.find((skill) => skill.id === skillId)?.label ?? null;
}

/**
 * The skill for the next turn: `undefined` keeps the default (what the chat
 * or its Action continues with), `null` is an explicit Automatic, else an id.
 * Any skill can write in any chat; a different deliverable becomes another document.
 */
export function useSkillChoice({
  value,
  onChange,
  hasDocument = false,
  inheritedSkillId,
  hasAction = false,
  pinned,
}: Readonly<{
  value: string | null | undefined;
  onChange: (skillId: string | null | undefined) => void;
  /** The chat already holds a document, so an unpicked skill continues its skill. */
  hasDocument?: boolean;
  inheritedSkillId?: string | null;
  hasAction?: boolean;
  /** A workflow a handoff pinned: the default until a skill is picked or it is removed. */
  pinned?: Readonly<{ label: string; onRemove: () => void }>;
}>) {
  const catalog = useAgentCatalog();
  const { skills } = catalog;
  const defaultLabel = defaultLabelFor(skills, {
    pinned,
    inheritedSkillId,
    hasDocument,
    hasAction,
  });
  // An id the catalog has not named (yet) is still a pick, never Automatic.
  const picked = value ? (skillLabel(skills, value) ?? '…') : null;
  const isDefault = value === undefined && defaultLabel !== null;
  // A picked skill or a default the turn continues with reads as a chip;
  // removing a pick returns to the default, removing the default is Automatic.
  let chip: Readonly<{ label: string; onRemove: () => void }> | undefined;
  if (picked) chip = { label: `Skill: ${picked}`, onRemove: () => onChange(undefined) };
  else if (isDefault)
    chip = {
      label: `Skill: ${defaultLabel}`,
      onRemove: pinned?.onRemove ?? (() => onChange(null)),
    };
  return {
    skills,
    status: catalog.read.status,
    chip,
    current: picked ?? (isDefault ? defaultLabel : 'Automatic'),
    defaultLabel,
    radioValue: isDefault ? INHERIT : (value ?? AUTOMATIC),
    choose: (next: string) => onChange(selectedValue(next)),
  };
}
export type SkillChoice = ReturnType<typeof useSkillChoice>;

/** The composer menu's Skills submenu. */
export function SkillsSubmenu({
  choice,
  onSelect,
}: Readonly<{ choice: SkillChoice; onSelect?: () => void }>) {
  return (
    <MenuSub>
      <MenuSubTrigger value={choice.current}>Skills</MenuSubTrigger>
      <MenuSubContent>
        <SkillOptions choice={choice} onSelect={onSelect} />
      </MenuSubContent>
    </MenuSub>
  );
}

/** The skill options: the default, Automatic, then each group's skills. */
export function SkillOptions({
  choice,
  onSelect,
}: Readonly<{ choice: SkillChoice; onSelect?: () => void }>) {
  const groups = new Map<string, AgentSkill[]>();
  for (const skill of choice.skills) {
    const label = skillGroupLabel(skill.group);
    groups.set(label, [...(groups.get(label) ?? []), skill]);
  }
  return (
    <MenuRadioGroup
      value={choice.radioValue}
      onValueChange={(next) => {
        onSelect?.();
        choice.choose(next);
      }}
    >
      {choice.defaultLabel ? (
        <MenuRadioItem value={INHERIT}>{choice.defaultLabel}</MenuRadioItem>
      ) : null}
      <MenuRadioItem value={AUTOMATIC}>Automatic</MenuRadioItem>
      {/* Until the catalog is read, an empty list is not a plan without skills. */}
      {choice.status === 'pending' ? <MenuItem disabled>Loading skills…</MenuItem> : null}
      {choice.status === 'error' ? <MenuItem disabled>{"Couldn't load skills"}</MenuItem> : null}
      {[...groups].map(([group, rows]) => (
        <Fragment key={group}>
          <MenuSeparator />
          <MenuLabel>{group}</MenuLabel>
          {rows.map((skill) => (
            <MenuRadioItem key={skill.id} value={skill.id}>
              {skill.label}
            </MenuRadioItem>
          ))}
        </Fragment>
      ))}
    </MenuRadioGroup>
  );
}

/** What an unpicked turn runs: the pinned workflow, else what the chat or its Action continues with. */
function defaultLabelFor(
  skills: AgentSkill[],
  {
    pinned,
    inheritedSkillId,
    hasDocument,
    hasAction,
  }: Readonly<{
    pinned?: Readonly<{ label: string }>;
    inheritedSkillId?: string | null;
    hasDocument: boolean;
    hasAction: boolean;
  }>,
) {
  if (pinned) return pinned.label;
  const skill = skillLabel(skills, inheritedSkillId ?? null);
  if (skill) return `Continue with ${skill}`;
  if (hasDocument) return "Continue this chat's skill";
  return hasAction ? 'From attached Action' : null;
}
function selectedValue(next: string) {
  if (next === INHERIT) return undefined;
  return next === AUTOMATIC ? null : next;
}

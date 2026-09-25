'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { Fragment } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dropdown,
  DropdownContent,
  DropdownLabel,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { skillGroupLabel } from '@/lib/agent/vocabulary';
import { agentQueries, type AgentSkill } from '@/lib/api/agent';
import { useActiveWorkspaceId } from '@/lib/project/project-context';

const AUTOMATIC = '';

/** The catalog, shared by the picker and the message skill labels. */
export function useSkillCatalog(): AgentSkill[] {
  const workspaceId = useActiveWorkspaceId() ?? '';
  const query = useQuery({ ...agentQueries.skills(workspaceId), enabled: Boolean(workspaceId) });
  return query.data?.skills ?? [];
}

export function skillLabel(skills: AgentSkill[], skillId: string | null): string | null {
  if (!skillId) return null;
  return skills.find((skill) => skill.id === skillId)?.label ?? null;
}

/**
 * Choose the skill for the next turn, or leave it automatic. A chat with an
 * output offers only skills that produce the same kind of output; a different
 * kind of deliverable belongs in a new chat.
 */
export function SkillPicker({
  value,
  onChange,
  outputKind,
  disabled,
}: Readonly<{
  value: string | null;
  onChange: (skillId: string | null) => void;
  outputKind?: string | null;
  disabled?: boolean;
}>) {
  const skills = useSkillCatalog().filter(
    (skill) => !outputKind || skill.output_kind === outputKind,
  );
  const groups = new Map<string, AgentSkill[]>();
  for (const skill of skills) {
    const label = skillGroupLabel(skill.group);
    groups.set(label, [...(groups.get(label) ?? []), skill]);
  }
  const current = skillLabel(skills, value) ?? 'Automatic';
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} aria-label={`Skill: ${current}`}>
          Skill: {current}
          <ChevronDown className="size-3.5" aria-hidden />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="start" className="w-64">
        <DropdownRadioGroup
          value={value ?? AUTOMATIC}
          onValueChange={(next) => onChange(next === AUTOMATIC ? null : next)}
        >
          <DropdownRadioItem value={AUTOMATIC}>Automatic</DropdownRadioItem>
          {[...groups].map(([group, rows]) => (
            <Fragment key={group}>
              <DropdownSeparator />
              <DropdownLabel>{group}</DropdownLabel>
              {rows.map((skill) => (
                <DropdownRadioItem key={skill.id} value={skill.id}>
                  {skill.label}
                </DropdownRadioItem>
              ))}
            </Fragment>
          ))}
        </DropdownRadioGroup>
      </DropdownContent>
    </Dropdown>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { ComposerCommands, Mention } from '@/components/agent/command-menu';
import { useSkillCatalog } from '@/components/agent/skill-picker';
import { matchOptions, type CommandOption } from '@/lib/agent/composer-commands';
import { approachLabel, skillGroupLabel } from '@/lib/agent/vocabulary';
import { actionsQueries } from '@/lib/api/actions';
import { AGENT_MENTIONS_MAX } from '@/lib/config/agent';

const SKILL = 'skill:';
const ACTION = 'action:';

/**
 * The composer's `/` skill command and `@` Action mentions. Mentions are
 * typed Action IDs the server resolves and authorizes when the turn is
 * queued; their labels here are only for display.
 */
export function useComposerCommands({
  workspaceId,
  projectId,
  outputKind,
  onSkill,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  outputKind?: string | null;
  onSkill: (skillId: string) => void;
}>): ComposerCommands & { clear: () => void; restore: (mentions: readonly Mention[]) => void } {
  const [mentions, setMentions] = useState<Mention[]>([]);
  const skills = useSkillCatalog().filter(
    (skill) => !outputKind || skill.output_kind === outputKind,
  );
  const actions = useQuery({
    ...actionsQueries.list(workspaceId, projectId),
    enabled: Boolean(workspaceId && projectId),
  });

  const skillOptions: CommandOption[] = skills.map((skill) => ({
    key: `${SKILL}${skill.id}`,
    label: skill.label,
    detail: skillGroupLabel(skill.group),
    replacement: '',
  }));
  const mentioned = new Set(mentions.map((mention) => mention.id));
  const actionOptions: CommandOption[] = (actions.data?.items ?? [])
    .filter((action) => !mentioned.has(action.id))
    .map((action) => ({
      key: `${ACTION}${action.id}`,
      label: action.target_label,
      detail: approachLabel(action.approach) ?? undefined,
      replacement: `@${action.target_label}`,
    }));

  return {
    options: (token) => {
      if (token.trigger === '/') return matchOptions(skillOptions, token.query);
      if (mentions.length >= AGENT_MENTIONS_MAX) return [];
      return matchOptions(actionOptions, token.query);
    },
    onPick: (option) => {
      if (option.key.startsWith(SKILL)) onSkill(option.key.slice(SKILL.length));
      else
        setMentions((current) => [
          ...current,
          { id: option.key.slice(ACTION.length), label: option.label },
        ]);
    },
    mentions,
    onRemoveMention: (id) => setMentions((current) => current.filter((item) => item.id !== id)),
    clear: () => setMentions([]),
    restore: (saved) => setMentions([...saved]),
  };
}

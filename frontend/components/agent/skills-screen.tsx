'use client';

import { useQuery } from '@tanstack/react-query';

import { PageShell } from '@/components/layout/page-shell';
import { Stack } from '@/components/ui/layout';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionTitle, textRole } from '@/components/ui/typography';
import { outputKindLabel, skillGroupLabel } from '@/lib/agent/vocabulary';
import { agentQueries, type AgentSkill } from '@/lib/api/agent';
import { useActiveWorkspaceId } from '@/lib/project/project-context';

/**
 * The skills the agent can apply: name, one sentence and what each produces.
 * Read-only; methodology text is never shown and nothing is downloadable.
 */
export function SkillsScreen() {
  const workspaceId = useActiveWorkspaceId() ?? '';
  const query = useQuery({ ...agentQueries.skills(workspaceId), enabled: Boolean(workspaceId) });

  let body;
  if (query.isError)
    body = (
      <ReadError
        error={query.error}
        fallback="Skills could not be loaded."
        onRetry={() => void query.refetch()}
        pending={query.isFetching}
      />
    );
  else if (!query.data) body = <Skeleton className="h-48 w-full" />;
  else body = <SkillGroups skills={query.data.skills} />;

  return (
    <PageShell measure="workflow">
      <Stack gap="section">
        <p className={textRole('body')}>
          The agent picks a skill for each request, or you can choose one in a chat.
        </p>
        {body}
      </Stack>
    </PageShell>
  );
}

function SkillGroups({ skills }: Readonly<{ skills: AgentSkill[] }>) {
  const groups = new Map<string, AgentSkill[]>();
  for (const skill of skills) {
    const label = skillGroupLabel(skill.group);
    groups.set(label, [...(groups.get(label) ?? []), skill]);
  }
  return (
    <Stack gap="section">
      {[...groups].map(([group, rows]) => (
        <section key={group} aria-label={group} className="grid gap-3">
          <SectionTitle>{group}</SectionTitle>
          <ul className="divide-border-subtle grid divide-y">
            {rows.map((skill) => (
              <li key={skill.id} className="grid gap-1 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className={textRole('bodyStrong')}>{skill.label}</h3>
                  <span className={textRole('meta')}>
                    Produces: {outputKindLabel(skill.output_kind)}
                  </span>
                </div>
                <p className={textRole('body')}>{skill.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Stack>
  );
}

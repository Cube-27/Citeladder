'use client';

import { useQuery } from '@tanstack/react-query';

import { PageShell } from '@/components/layout/page-shell';
import { ProjectLink } from '@/components/layout/scoped-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Stack } from '@/components/ui/layout';
import { panelClasses } from '@/components/ui/panel';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionTitle, textRole } from '@/components/ui/typography';
import { agentHandoffHref } from '@/lib/agent/handoff';
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
        <p className={textRole('body', 'max-w-2xl')}>
          Skills are the agent’s available methods. It selects a method when a deliverable needs
          one, or you can choose here or in the composer. Typing / opens that same skill menu.
          Questions can stay simple replies.
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
          <div className="flex items-baseline gap-2">
            <SectionTitle>{group}</SectionTitle>
            <span className={textRole('caption')}>
              {rows.length} {rows.length === 1 ? 'skill' : 'skills'}
            </span>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((skill) => (
              <li key={skill.id} className={panelClasses({ pad: 'compact' }, 'grid gap-3')}>
                <div className="grid gap-1">
                  <h3 className={textRole('itemTitle')}>{skill.label}</h3>
                  <p className={textRole('body')}>{skill.description}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 self-end">
                  <Badge>Produces {outputKindLabel(skill.output_kind).toLowerCase()}</Badge>
                  <Button asChild variant="ghost" size="sm">
                    <ProjectLink
                      href={agentHandoffHref({ skillId: skill.id })}
                      aria-label={`Start a chat with ${skill.label}`}
                    >
                      Start a chat
                    </ProjectLink>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Stack>
  );
}

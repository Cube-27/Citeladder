import { useQuery } from '@tanstack/react-query';

import { useAgentCatalog } from '@/components/agent/use-agent-catalog';
import { CollectionPage } from '@/components/templates/collection-page';
import { ProjectLink } from '@/components/ui/project-link';
import { AppGrid } from '@/components/ui/app-grid';
import { Tag } from '@/components/ui/tag';
import { Button } from '@/components/ui/button';
import { Inline, Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { skillGroupLabel } from '@/lib/agent/vocabulary';
import { agentQueries, type AgentSkill } from '@/lib/api/agent';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { StateBlock } from '@/components/ui/state-block';
import { slipClasses } from '@/components/ui/slip';

/**
 * The skills the agent can apply: name, one sentence and what each produces.
 * Read-only; methodology text is never shown and nothing is downloadable.
 */
export function SkillsScreen() {
  const { workspaceId } = useProjectScope();
  const query = useQuery(agentQueries.skills(workspaceId));

  let body;
  if (query.isError)
    body = (
      <StateBlock
        kind="error"
        error={query.error}
        title="Couldn't load skills"
        fallback="Skills could not be loaded."
        onRetry={() => void query.refetch()}
        pending={query.isFetching}
      />
    );
  else if (!query.data) body = <StateBlock kind="loading" />;
  else body = <SkillGroups skills={query.data.skills} />;

  return (
    <CollectionPage>
      {/* The template has no description slot, so the route's intro is the body's first child. */}
      <p className={textRole('body', 'text-ink-2')}>
        The agent picks a skill when a task needs one, or choose one here or type / in the composer.
      </p>
      {body}
    </CollectionPage>
  );
}

/**
 * What a skill produces, by the catalog's own name for it ("LinkedIn post",
 * "FAQ"), never lowercased. An output kind the catalog does not name shows
 * no badge rather than a placeholder.
 */
function OutputBadge({ label }: Readonly<{ label: string | undefined }>) {
  return label ? <Tag>{`Output: ${label}`}</Tag> : <span />;
}

function SkillGroups({ skills }: Readonly<{ skills: AgentSkill[] }>) {
  const { outputKind } = useAgentCatalog();
  const groups = new Map<string, AgentSkill[]>();
  for (const skill of skills) {
    const label = skillGroupLabel(skill.group);
    groups.set(label, [...(groups.get(label) ?? []), skill]);
  }
  return (
    <>
      {[...groups].map(([group, rows]) => (
        <Section key={group} aria-label={group}>
          <SectionHeader>
            <SectionTitle level={2}>{group}</SectionTitle>
            <SectionDescription>
              {rows.length} {rows.length === 1 ? 'skill' : 'skills'}
            </SectionDescription>
          </SectionHeader>
          <AppGrid as="ul" layout="halves">
            {rows.map((skill) => (
              <Stack as="li" key={skill.id} className={slipClasses()}>
                <Stack gap="tight">
                  <h3 className={textRole('subheading')}>{skill.label}</h3>
                  <p className={textRole('body', 'text-ink-2')}>{skill.description}</p>
                </Stack>
                <Inline className="flex-wrap justify-between self-end">
                  <OutputBadge label={outputKind(skill.output_kind)?.label} />
                  <Button asChild variant="secondary">
                    <ProjectLink
                      href={agentHandoffHref({ skillId: skill.id })}
                      aria-label={`Start a chat with ${skill.label}`}
                    >
                      Start a chat
                    </ProjectLink>
                  </Button>
                </Inline>
              </Stack>
            ))}
          </AppGrid>
        </Section>
      ))}
    </>
  );
}

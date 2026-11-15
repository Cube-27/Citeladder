import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';

import { useAgentCatalog } from '@/components/agent/use-agent-catalog';
import { CollectionPage } from '@/components/templates/collection-page';
import { ProjectLink } from '@/components/ui/project-link';
import { AppGrid } from '@/components/ui/app-grid';
import { Icon } from '@/components/ui/icon';
import { Tag } from '@/components/ui/tag';
import { Inline } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { skillGroupLabel } from '@/lib/agent/vocabulary';
import { agentQueries, type AgentSkill } from '@/lib/api/agent';
import { pluralCount } from '@/lib/format';
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
  return label ? (
    <p className="flex">
      <Tag>{`Output: ${label}`}</Tag>
    </p>
  ) : null;
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
        <Section key={group} variant="group" aria-label={group}>
          <SectionHeader>
            <SectionTitle level={2}>{group}</SectionTitle>
            <SectionDescription>{pluralCount(rows.length, 'skill')}</SectionDescription>
          </SectionHeader>
          {/* Auto-fit slips at least 280 wide: two across at 982. */}
          <AppGrid
            as="ul"
            layout="pair"
            className="column-split:grid-cols-[repeat(auto-fill,minmax(min(100%,17.5rem),1fr))] grid-cols-[repeat(auto-fill,minmax(min(100%,17.5rem),1fr))]"
          >
            {rows.map((skill) => (
              <li key={skill.id} className="flex">
                <SkillSlip skill={skill} output={outputKind(skill.output_kind)?.label} />
              </li>
            ))}
          </AppGrid>
        </Section>
      ))}
    </>
  );
}

/** A skill as a slip that starts a chat with it: the underlined title and a chevron say so at rest. */
function SkillSlip({ skill, output }: Readonly<{ skill: AgentSkill; output: string | undefined }>) {
  return (
    <ProjectLink
      href={agentHandoffHref({ skillId: skill.id })}
      aria-label={`Start a chat with ${skill.label}`}
      className={slipClasses('focus-ring flex w-full flex-col gap-3', { opens: true })}
    >
      <Inline className="justify-between">
        <h3 className={textRole('subheading', 'underline decoration-1 underline-offset-3')}>
          {skill.label}
        </h3>
        <Icon icon={ChevronRight} className="text-ink-2 shrink-0" />
      </Inline>
      <p className={textRole('body', 'text-ink-2 flex-1')}>{skill.description}</p>
      <OutputBadge label={output} />
    </ProjectLink>
  );
}

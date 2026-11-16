import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useId } from 'react';

import { useAgentCatalog } from '@/components/agent/use-agent-catalog';
import { ReportPage } from '@/components/templates/report-page';
import { ProjectLink } from '@/components/ui/project-link';
import { AppGrid } from '@/components/ui/app-grid';
import { Icon } from '@/components/ui/icon';
import { Tag } from '@/components/ui/tag';
import { Inline, Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { skillGroupLabel } from '@/lib/agent/vocabulary';
import { agentQueries, type AgentSkill } from '@/lib/api/agent';
import { pluralCount } from '@/lib/format';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { readErrorProps } from '@/components/ui/notice';
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
        {...readErrorProps(query)}
        title="Couldn't load skills"
        fallback="Skills could not be loaded."
      />
    );
  else if (!query.data) body = <StateBlock kind="loading" shape={{ kind: 'list' }} />;
  else body = <SkillGroups skills={query.data.skills} />;

  return (
    <ReportPage>
      {/* The template has no description slot, so the route's intro is the body's first child. */}
      <p className={textRole('body', 'text-ink-2')}>
        The agent picks a skill when a task needs one, or choose one here or type / in the composer.
      </p>
      {body}
    </ReportPage>
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
          <AppGrid as="ul" layout="slips">
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
  const detailId = useId();
  return (
    <ProjectLink
      href={agentHandoffHref({ skillId: skill.id })}
      aria-label={`Start a chat with ${skill.label}`}
      aria-describedby={detailId}
      className={slipClasses('focus-ring w-full', { opens: true })}
    >
      <Stack gap="item">
        <Inline className="justify-between">
          <h3 className={textRole('subheading', 'underline decoration-1 underline-offset-3')}>
            {skill.label}
          </h3>
          <Icon icon={ChevronRight} className="text-ink-2 shrink-0" />
        </Inline>
        {/* The link's name replaces its content, so what it does is its description. */}
        <div id={detailId} className="contents">
          <p className={textRole('body', 'text-ink-2')}>{skill.description}</p>
          <OutputBadge label={output} />
        </div>
      </Stack>
    </ProjectLink>
  );
}

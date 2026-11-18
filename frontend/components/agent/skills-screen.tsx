import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  FileText,
  Link2,
  ListChecks,
  ListTodo,
  type LucideIcon,
  Megaphone,
  MessageSquareText,
  PenLine,
  Search,
  Sparkles,
  Stethoscope,
  Wrench,
} from 'lucide-react';
import { useId } from 'react';

import { useAgentCatalog } from '@/components/agent/use-agent-catalog';
import { ReportPage } from '@/components/templates/report-page';
import { ProjectLink } from '@/components/ui/project-link';
import { AppGrid } from '@/components/ui/app-grid';
import { ICON_CARD, IconCardContent } from '@/components/ui/icon-card';
import { textRole } from '@/components/ui/typography';
import { Section, SectionHeader, SectionTitle } from '@/components/ui/section';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { skillGroupLabel } from '@/lib/agent/vocabulary';
import { agentQueries, type AgentSkill } from '@/lib/api/agent';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

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

/** A skill's icon, by the catalog's output kind (`config/agent-skills.ts`). */
const OUTPUT_ICONS: Readonly<Record<string, LucideIcon>> = {
  plan: ListTodo,
  measurement: BarChart3,
  research: Search,
  prompt_plan: MessageSquareText,
  page_edits: PenLine,
  link_plan: Link2,
  technical_fix: Wrench,
  diagnosis: Stethoscope,
  earned_brief: Megaphone,
  content: FileText,
  page: ListChecks,
};

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
            <SectionTitle level={2}>
              {group} <span className="text-ink-2">({rows.length})</span>
            </SectionTitle>
          </SectionHeader>
          <AppGrid as="ul" layout="pair">
            {rows.map((skill) => (
              <li key={skill.id} className="flex min-w-0">
                <SkillCard skill={skill} output={outputKind(skill.output_kind)?.label} />
              </li>
            ))}
          </AppGrid>
        </Section>
      ))}
    </>
  );
}

/** A skill as a wide card that starts a chat with it: icon tile, name, two lines and its output. */
function SkillCard({ skill, output }: Readonly<{ skill: AgentSkill; output: string | undefined }>) {
  const detailId = useId();
  return (
    <ProjectLink
      href={agentHandoffHref({ skillId: skill.id })}
      aria-label={`Start a chat with ${skill.label}`}
      aria-describedby={detailId}
      className={ICON_CARD}
    >
      {/* The link's name replaces its content, so what it does is its description. */}
      <IconCardContent
        icon={OUTPUT_ICONS[skill.output_kind] ?? Sparkles}
        title={skill.label}
        detailId={detailId}
      >
        <p className={textRole('body', 'text-ink-2 line-clamp-2')}>{skill.description}</p>
        {output ? <p className={textRole('caption', 'text-ink-2')}>{`Output: ${output}`}</p> : null}
      </IconCardContent>
    </ProjectLink>
  );
}

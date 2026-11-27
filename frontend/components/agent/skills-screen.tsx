import { useQuery } from '@tanstack/react-query';

import { useAgentCatalog } from '@/components/agent/use-agent-catalog';
import { ReportPage } from '@/components/templates/report-page';
import { LinkListRow } from '@/components/ui/list-row';
import { AppGrid } from '@/components/ui/app-grid';
import { Section, SectionBleed, SectionHeader, SectionTitle } from '@/components/ui/section';
import {
  BarChart3,
  FileText,
  Link2,
  ListChecks,
  ListTodo,
  Megaphone,
  MessageSquareText,
  PenLine,
  Search,
  Sparkles,
  Stethoscope,
  Wrench,
  type IconGlyph,
} from '@/lib/icons';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { skillGroupLabel } from '@/lib/agent/vocabulary';
import { agentQueries, type AgentSkill } from '@/lib/api/agent';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

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

  return <ReportPage>{body}</ReportPage>;
}

const OUTPUT_ICONS: Readonly<Record<string, IconGlyph>> = {
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
    <AppGrid layout="pair">
      {[...groups].map(([group, rows]) => (
        <Section key={group} aria-label={group}>
          <SectionHeader>
            <SectionTitle level={2} count={rows.length}>
              {group}
            </SectionTitle>
          </SectionHeader>
          <SectionBleed as="ul" rows>
            {rows.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                output={outputKind(skill.output_kind)?.label}
              />
            ))}
          </SectionBleed>
        </Section>
      ))}
    </AppGrid>
  );
}

function SkillRow({ skill, output }: Readonly<{ skill: AgentSkill; output: string | undefined }>) {
  return (
    <LinkListRow
      icon={OUTPUT_ICONS[skill.output_kind] ?? Sparkles}
      href={agentHandoffHref({ skillId: skill.id })}
      label={skill.label}
      linkLabel={`Start a chat with ${skill.label}`}
      description={skill.description}
      end={
        output ? (
          <>
            <span className="sr-only">Output:</span> {output}
          </>
        ) : undefined
      }
    />
  );
}

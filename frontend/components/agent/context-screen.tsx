import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { AgentInstructionsCard, useAgentInstructions } from '@/components/agent/agent-instructions';
import { BrandAliasesPanel } from '@/components/knowledge-base/brand-aliases-panel';
import { BrandFactsPanel } from '@/components/knowledge-base/brand-facts-panel';
import {
  AudienceCard,
  CompanyFactsCard,
  ProfileSaveNotices,
  TrackedCompetitorsCard,
} from '@/components/knowledge-base/brand-profile-cards';
import { BusinessMapSummary } from '@/components/knowledge-base/business-map-summary';
import {
  useBrandProfileForm,
  type BrandProfileForm,
} from '@/components/knowledge-base/use-brand-profile-form';
import { SettingsPage } from '@/components/templates/settings-page';
import { TabPanel, TabRow, TabsRoot } from '@/components/ui/tabs';
import { Stack } from '@/components/ui/layout';
import { readErrorProps } from '@/components/ui/notice';
import { projectQueries } from '@/lib/api/projects';
import type { BrandProfile, Project } from '@citeladder/contracts';
import { CONTEXT_TABS, type ContextTab } from '@/lib/agent/context-tabs';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { useBrandFacts } from '@/lib/project/use-brand-facts';
import { StateBlock } from '@/components/ui/state-block';
import { Section, SectionHeader, SectionTitle } from '@/components/ui/section';

type ProfileRead = UseQueryResult<BrandProfile>;

const CONTEXT_TAB_CODEC = stringUrlCodec<ContextTab>(
  CONTEXT_TABS.map((tab) => tab.value),
  'facts',
);

/**
 * What the agent knows about the business before it reads any evidence, one
 * tab per subject: the company facts, audience and offerings, the read-only
 * business map the Prompt Builder edits, the tracked competitors, the pilot's
 * Brand facts, and the project's Agent instructions. Each tab is one or two
 * sections of setting rows; a form section carries its own Save in its foot.
 */
export function ContextScreen() {
  const { workspaceId, project } = useProjectScope();
  return <ContextWorkspace workspaceId={workspaceId} project={project} />;
}

function ContextWorkspace({
  workspaceId,
  project,
}: Readonly<{ workspaceId: string; project: Project }>) {
  const [requestedTab, setTab] = useUrlState('tab', CONTEXT_TAB_CODEC);
  const profile = useQuery(projectQueries.brandProfile({ workspaceId, projectId: project.id }));
  // Brand facts always holds the aliases; its facts list waits on the pilot gate.
  const facts = useBrandFacts();
  const form = useBrandProfileForm({
    projectId: project.id,
    workspaceId,
    profile: profile.data,
  });
  const instructions = useAgentInstructions(workspaceId, project.id);

  return (
    <TabsRoot value={requestedTab} onValueChange={setTab}>
      <SettingsPage tabs={<TabRow items={CONTEXT_TABS} ariaLabel="Context sections" />}>
        <ContextPanels
          project={project}
          workspaceId={workspaceId}
          profile={profile}
          form={form}
          brandFacts={<BrandFactsTab facts={facts} workspaceId={workspaceId} project={project} />}
          instructions={<AgentInstructionsCard instructions={instructions} />}
        />
      </SettingsPage>
    </TabsRoot>
  );
}

function ContextPanels({
  project,
  workspaceId,
  profile,
  form,
  brandFacts,
  instructions,
}: Readonly<{
  project: Project;
  workspaceId: string;
  profile: ProfileRead;
  form: BrandProfileForm;
  brandFacts: ReactNode;
  instructions: ReactNode;
}>) {
  return (
    <>
      <TabPanel value="facts">
        <ProfileTab profile={profile} form={form}>
          <CompanyFactsCard form={form} />
        </ProfileTab>
      </TabPanel>
      <TabPanel value="audience">
        <ProfileTab profile={profile} form={form}>
          <AudienceCard form={form} />
        </ProfileTab>
      </TabPanel>
      <TabPanel value="map">
        {profile.data ? (
          <BusinessMapSummary
            projectId={project.id}
            workspaceId={workspaceId}
            profile={profile.data}
          />
        ) : (
          <ProfileState profile={profile} />
        )}
      </TabPanel>
      <TabPanel value="competitors">
        <TrackedCompetitorsCard project={project} />
      </TabPanel>
      <TabPanel value="brand-facts">{brandFacts}</TabPanel>
      <TabPanel value="instructions">{instructions}</TabPanel>
    </>
  );
}

/** A tab the profile save covers: its notices above its card, once the profile is read. */
function ProfileTab({
  profile,
  form,
  children,
}: Readonly<{
  profile: ProfileRead;
  form: BrandProfileForm;
  children: ReactNode;
}>) {
  if (!profile.data) return <ProfileState profile={profile} />;
  return (
    <Stack gap="workspace">
      <ProfileSaveNotices form={form} />
      {children}
    </Stack>
  );
}

/** The profile's loading or read error, in the one query-state footprint. */
function ProfileState({ profile }: Readonly<{ profile: ProfileRead }>) {
  if (profile.isPending)
    return (
      <StateBlock
        kind="loading"
        label="Loading company facts…"
        shape={{ kind: 'facts', rows: 5 }}
      />
    );
  return (
    <StateBlock
      kind="error"
      {...readErrorProps(profile)}
      title="Couldn't load company facts"
      fallback="Company facts could not be loaded."
    />
  );
}

/**
 * The brand's aliases, then the facts answers are checked against; the facts
 * show only inside the fact-checking pilot, or with the gate's read error.
 */
function BrandFactsTab({
  facts,
  workspaceId,
  project,
}: Readonly<{
  facts: ReturnType<typeof useBrandFacts>;
  workspaceId: string;
  project: Project;
}>) {
  const mayEdit = useWorkspaceCapability('write');
  return (
    <Stack gap="workspace">
      <Section aria-labelledby="brand-aliases">
        <SectionHeader>
          <SectionTitle id="brand-aliases">Aliases</SectionTitle>
        </SectionHeader>
        <BrandAliasesPanel project={project} mayEdit={mayEdit} />
      </Section>
      <BrandFactsSection
        facts={facts}
        workspaceId={workspaceId}
        projectId={project.id}
        mayEdit={mayEdit}
      />
    </Stack>
  );
}

function BrandFactsSection({
  facts,
  workspaceId,
  projectId,
  mayEdit,
}: Readonly<{
  facts: ReturnType<typeof useBrandFacts>;
  workspaceId: string;
  projectId: string;
  mayEdit: boolean;
}>) {
  if (facts.isPending)
    return <StateBlock kind="loading" label="Loading brand facts…" shape={{ kind: 'list' }} />;
  if (!facts.isError && !facts.data?.enabled) return null;
  return (
    <Section aria-labelledby="brand-facts">
      <SectionHeader>
        <SectionTitle id="brand-facts">Brand facts</SectionTitle>
      </SectionHeader>
      {facts.data?.enabled ? (
        <BrandFactsPanel
          workspaceId={workspaceId}
          projectId={projectId}
          list={facts.data}
          mayEdit={mayEdit}
        />
      ) : (
        <StateBlock
          kind="error"
          {...readErrorProps(facts)}
          title="Couldn't load brand facts"
          fallback="Brand facts could not be loaded."
        />
      )}
    </Section>
  );
}

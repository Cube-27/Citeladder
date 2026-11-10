'use client';

import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DisplayTime } from '@/components/ui/display-time';
import { FactList } from '@/components/ui/facts';
import { Inline, Stack } from '@/components/ui/layout';
import { QueryState } from '@/components/ui/query-state';
import { ReadError, readErrorProps } from '@/components/ui/read-error';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import { agentHandoffHref } from '@/lib/agent/handoff';
import type { ActionDetail } from '@/lib/api/actions';
import { CONTENT_GAP_WORKFLOWS } from '@/lib/config/agent';
import { opportunitiesQueries } from '@/lib/api/opportunities';
import { promptsQueries } from '@/lib/api/prompts';
import { formatCount, readableUrl } from '@/lib/format';
import { classificationBadgeValue, classificationLabel } from '@/lib/runs/status';
import { contentGapRuleSchema } from '@citeladder/contracts/actions';
import { citationClassificationSchema } from '@citeladder/contracts/audits';
import {
  opportunityEvidenceSchemas,
  type ContentGapImprovePageEvidence,
  type ContentGapNewPageEvidence,
} from '@citeladder/contracts/opportunity-evidence';
import { actionPath } from '@citeladder/contracts/record-kinds';

type Member = ActionDetail['members'][number];
type GapEvidence = ContentGapImprovePageEvidence | ContentGapNewPageEvidence;

const plural = (count: number, one: string, many: string) =>
  `${formatCount(count)} ${count === 1 ? one : many}`;

/** The Action's content-gap findings, in member order. */
export function contentGapMembers(action: ActionDetail): Member[] {
  return action.members.filter((member) => contentGapRuleSchema.safeParse(member.rule_id).success);
}

/**
 * The Agent handoff of an Action with a content gap: a page to create is
 * written from its Opportunity with the article workflow; an existing page
 * is refreshed from its URL. Null for an Action with no content gap.
 */
export function contentGapHandoff(
  action: ActionDetail,
): Readonly<{ label: string; href: string }> | null {
  const [gap] = contentGapMembers(action);
  if (!gap) return null;
  if (gap.rule_id === 'content_gap_new_page')
    return {
      label: 'Write this page',
      href: agentHandoffHref({
        actionId: action.id,
        opportunityId: gap.id,
        workflowId: CONTENT_GAP_WORKFLOWS.content_gap_new_page,
      }),
    };
  return {
    label: 'Work on this',
    href: agentHandoffHref({
      actionId: action.id,
      targetUrl: action.target_url,
      workflowId: CONTENT_GAP_WORKFLOWS.content_gap_improve_page,
    }),
  };
}

/** The evidence a content-gap finding stored, or null when it is not in that shape. */
function gapEvidence(rule: string, evidence: unknown): GapEvidence | null {
  const parsed = contentGapRuleSchema.safeParse(rule);
  if (!parsed.success) return null;
  const result = opportunityEvidenceSchemas[parsed.data].safeParse(evidence);
  return result.success ? result.data : null;
}

/**
 * Why the content-gap findings of an Action matter, from their persisted
 * evidence only: each angle, the competitor and publisher pages cited for it
 * with their domain and classification, the prompts, the counts and the
 * window. Counts, never a score (CO14).
 */
export function ContentGapWhy({
  members,
  workspaceId,
  projectId,
}: Readonly<{ members: readonly Member[]; workspaceId: string; projectId: string }>) {
  // The prompt texts behind each angle's prompt ids; the library is one read.
  const prompts = useQuery(promptsQueries.sets({ workspaceId, projectId }));
  const promptText = new Map(
    (prompts.data?.prompt_sets ?? []).flatMap((set) =>
      set.prompts.map((prompt) => [prompt.id, prompt.text] as const),
    ),
  );
  return (
    <Card aria-labelledby="action-why">
      <CardHeader>
        <CardTitle id="action-why">Why this matters</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className={ledgerClasses()}>
          {members.map((member) => (
            <li key={member.id} className={ledgerItemClasses()}>
              <GapFinding member={member} workspaceId={workspaceId} promptText={promptText} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** One finding's evidence, read from the Opportunity it is stored on. */
function GapFinding({
  member,
  workspaceId,
  promptText,
}: Readonly<{ member: Member; workspaceId: string; promptText: ReadonlyMap<string, string> }>) {
  const detail = useQuery(opportunitiesQueries.detail(workspaceId, member.id));
  if (detail.isError)
    return <ReadError {...readErrorProps(detail)} fallback="This evidence could not be loaded." />;
  if (!detail.data) return <QueryState kind="loading" label="Loading the evidence" />;
  const evidence = gapEvidence(member.rule_id, detail.data.evidence);
  return evidence ? (
    <GapAngle evidence={evidence} promptText={promptText} />
  ) : (
    <QueryState kind="empty" inline message="This finding has no angle evidence." />
  );
}

function GapAngle({
  evidence,
  promptText,
}: Readonly<{ evidence: GapEvidence; promptText: ReadonlyMap<string, string> }>) {
  const prompts = evidence.prompt_ids.flatMap((id) => {
    const text = promptText.get(id);
    return text ? [{ id, text }] : [];
  });
  const continues = 'continues_action_id' in evidence ? evidence.continues_action_id : undefined;
  return (
    <Stack>
      <p className={textRole('itemTitle')}>{evidence.angle_label}</p>
      <FactList
        layout="inline"
        label="Counts"
        facts={[
          { label: 'Citations', value: formatCount(evidence.citation_count) },
          { label: 'Sites', value: formatCount(evidence.domain_count) },
          { label: 'Competitors', value: formatCount(evidence.competitor_count) },
          { label: 'Prompts', value: formatCount(evidence.prompt_ids.length) },
          {
            label: 'Window',
            value: (
              <span>
                <DisplayTime value={evidence.window.start} dateOnly /> to{' '}
                <DisplayTime value={evidence.window.end} dateOnly />
              </span>
            ),
          },
        ]}
      />
      <Stack as="section" gap="tight" aria-label="Cited pages">
        <span className={textRole('label')}>Cited pages</span>
        <ul className={ledgerClasses()}>
          {evidence.members.map((page) => (
            <CitedPage key={page.url} page={page} />
          ))}
        </ul>
        {evidence.member_count > evidence.members.length ? (
          <span className={textRole('caption')}>
            The {formatCount(evidence.members.length)} most cited of{' '}
            {plural(evidence.member_count, 'page', 'pages')}.
          </span>
        ) : null}
      </Stack>
      {prompts.length > 0 ? (
        <Stack as="section" gap="tight" aria-label="Prompts">
          <span className={textRole('label')}>Prompts</span>
          <Stack as="ul" gap="tight">
            {prompts.map((prompt) => (
              <li key={prompt.id}>
                <TextLink href={`/prompts/${prompt.id}`} text="body">
                  {prompt.text}
                </TextLink>
              </li>
            ))}
          </Stack>
        </Stack>
      ) : null}
      {continues ? (
        <TextLink
          href={actionPath({ id: continues, surface: 'content' })}
          text="body"
          className="justify-self-start"
        >
          Continues the planned page for this angle
        </TextLink>
      ) : null}
    </Stack>
  );
}

/** One cited page: its title, then its site, classification and citations. */
function CitedPage({ page }: Readonly<{ page: GapEvidence['members'][number] }>) {
  const classification = citationClassificationSchema.safeParse(page.classification);
  const site = page.matched_competitor
    ? `${page.matched_competitor} (${page.domain})`
    : page.domain;
  return (
    <Stack as="li" gap="tight" className={ledgerItemClasses()}>
      <TextLink variant="external" href={page.url} text="body" className="justify-self-start">
        {page.title || readableUrl(page.url)}
      </TextLink>
      <Inline gap="compact" className="flex-wrap">
        {classification.success ? (
          <Badge variant="classification" value={classificationBadgeValue(classification.data)}>
            {classificationLabel(classification.data)}
          </Badge>
        ) : null}
        <span className={textRole('caption')}>
          {site} · {plural(page.citation_count, 'citation', 'citations')}
        </span>
      </Inline>
    </Stack>
  );
}

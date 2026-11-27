import { useState, type ReactNode } from 'react';

import { AskAgentLink } from '@/components/agent/ask-agent-link';
import { askAgentPrompt, buildFixPrompt } from '@/lib/site-health/issue-prompts';
import { IssueEvidence } from '@/components/site-health/issue-evidence';
import { IssueSeverityMark } from '@/components/site-health/issue-metadata';
import { Tag } from '@/components/ui/tag';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Inline, Stack } from '@/components/ui/layout';
import { DisclosureList, DisclosureRow } from '@/components/ui/list-row';
import { Icon } from '@/components/ui/icon';
import type { PageIssue } from '@citeladder/contracts';
import { dimensionLabel, scoreRoleLabels, severityRank } from '@/lib/site-health/issues';
import { StateBlock } from '@/components/ui/state-block';
import { ChevronDown } from '@/lib/icons';
import { TitledSection } from '@/components/ui/section';
import { Text } from '@/components/ui/typography';

const PREVIEW_COUNT = 5;

export function PageIssues({
  issues,
  audited,
  crawlId,
}: Readonly<{
  issues: readonly PageIssue[];
  audited: boolean;
  crawlId: string;
}>) {
  const sorted = [...issues].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return (
    <TitledSection title={`All issues (${sorted.length})`}>
      {sorted.length === 0 ? (
        <StateBlock
          kind="empty"
          inline
          message={audited ? 'No issues found.' : 'Audit not finished.'}
        />
      ) : (
        <IssueList issues={sorted} crawlId={crawlId} />
      )}
    </TitledSection>
  );
}

function IssueList({
  issues,
  crawlId,
}: Readonly<{ issues: readonly PageIssue[]; crawlId: string }>) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? issues : issues.slice(0, PREVIEW_COUNT);
  return (
    <Stack gap="item">
      <DisclosureList>
        {shown.map((issue) => (
          <IssueRow key={issue.occurrence_id} issue={issue}>
            <IssueBody issue={issue} crawlId={crawlId} />
          </IssueRow>
        ))}
      </DisclosureList>
      {issues.length > PREVIEW_COUNT ? (
        <Button variant="quiet" box="fit" onClick={() => setExpanded(!expanded)}>
          <Icon icon={ChevronDown} flip={expanded} />
          {expanded ? 'Show fewer issues' : `View all ${issues.length} issues`}
        </Button>
      ) : null}
    </Stack>
  );
}

function IssueRow({ issue, children }: Readonly<{ issue: PageIssue; children: ReactNode }>) {
  return (
    <DisclosureRow
      title={issue.issue_title}
      meta={
        <>
          <IssueSeverityMark issue={issue} />
          <span>{dimensionLabel(issue.dimension)}</span>
        </>
      }
    >
      {children}
    </DisclosureRow>
  );
}

function IssueBody({ issue, crawlId }: Readonly<{ issue: PageIssue; crawlId: string }>) {
  const head = { ...issue, title: issue.issue_title, affected_url_count: 1 };
  const scores = scoreRoleLabels(issue.score_roles);
  return (
    <>
      <Remediation issue={issue} />
      <IssueEvidence occurrence={issue} />
      {scores.length > 0 ? (
        <Inline as="p" wrap>
          <Text variant="caption">Counts toward</Text>
          {scores.map((score) => (
            <Tag key={score}>{score}</Tag>
          ))}
        </Inline>
      ) : null}
      <Inline wrap>
        <AskAgentLink
          handoff={{
            issueGroup: { crawlId, groupId: issue.group_id, siteUrlId: issue.site_url_id },
            prompt: askAgentPrompt(head, issue.display_url),
            skillId: 'technical_health',
          }}
        />
        <CopyButton value={buildFixPrompt(head)} variant="secondary" box="fit">
          Copy fix prompt
        </CopyButton>
      </Inline>
    </>
  );
}

function Remediation({ issue }: Readonly<{ issue: PageIssue }>) {
  return issue.remediation ? (
    <Text as="p" variant="body" wrap="lines">
      {issue.remediation}
    </Text>
  ) : null;
}

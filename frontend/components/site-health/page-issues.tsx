import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { AskAgentLink } from '@/components/agent/ask-agent-link';
import { askAgentPrompt, buildFixPrompt } from '@/components/site-health/issue-detail-dialog';
import { IssueEvidence } from '@/components/site-health/issue-evidence';
import { Tag } from '@/components/ui/tag';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Inline, Stack } from '@/components/ui/layout';
import { DisclosureList, DisclosureRow } from '@/components/ui/list-row';
import { StatusMark } from '@/components/ui/status-mark';
import { Icon } from '@/components/ui/icon';
import type { PageIssue } from '@citeladder/contracts';
import {
  dimensionLabel,
  scoreRoleLabels,
  severityLabel,
  severityRank,
} from '@/lib/site-health/issues';
import { StateBlock } from '@/components/ui/state-block';
import { cn } from '@/lib/utils';
import { SectionContent, TitledSection } from '@/components/ui/section';

/** Issues the list shows before "View all". */
const PREVIEW_COUNT = 5;

/** Re-audits the page; omitted for a role that may not run one. */
export type RerunControl = Readonly<{ onRerun: () => void; busy: boolean }>;

/**
 * A page's findings, said once: every issue on one list, worst first, each
 * row opening in place to its fix, its evidence and the ways to act on it;
 * then the advisories apart. The masthead's "Re-audit this page" is the one
 * re-audit action.
 */
export function PageIssues({
  issues,
  audited,
  crawlId,
}: Readonly<{
  issues: readonly PageIssue[];
  /** No issues before the audit finishes means "not checked yet", not "clean". */
  audited: boolean;
  crawlId: string;
}>) {
  const defects = issues
    .filter((issue) => issue.finding_class === 'defect')
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const advisories = issues.filter((issue) => issue.finding_class !== 'defect');
  return (
    <>
      <TitledSection title={`All issues (${defects.length})`}>
        <SectionContent>
          {defects.length === 0 ? (
            <StateBlock
              kind="empty"
              inline
              message={audited ? 'No issues found.' : 'Audit not finished.'}
            />
          ) : (
            <IssueList issues={defects} crawlId={crawlId} />
          )}
        </SectionContent>
      </TitledSection>
      {advisories.length > 0 ? <Advisories advisories={advisories} /> : null}
    </>
  );
}

/** The issue list: the first few, then all of them on request. */
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
        <Button variant="quiet" className="w-fit" onClick={() => setExpanded(!expanded)}>
          <Icon icon={ChevronDown} className={cn(expanded && 'rotate-180')} />
          {expanded ? 'Show fewer issues' : `View all ${issues.length} issues`}
        </Button>
      ) : null}
    </Stack>
  );
}

/** One issue: its title over its severity and category, opening its body in place. */
function IssueRow({ issue, children }: Readonly<{ issue: PageIssue; children: ReactNode }>) {
  return (
    <DisclosureRow
      title={issue.issue_title}
      meta={
        <>
          {issue.finding_class === 'defect' ? (
            <StatusMark variant="severity" value={issue.severity}>
              {severityLabel(issue.severity)}
            </StatusMark>
          ) : null}
          <span>{dimensionLabel(issue.dimension)}</span>
        </>
      }
    >
      {children}
    </DisclosureRow>
  );
}

/** What the row does not say: the fix, the evidence, the scores it holds down and the actions. */
function IssueBody({ issue, crawlId }: Readonly<{ issue: PageIssue; crawlId: string }>) {
  const head = { ...issue, title: issue.issue_title, affected_url_count: 1 };
  const scores = scoreRoleLabels(issue.score_roles);
  return (
    <>
      <Remediation issue={issue} />
      <IssueEvidence occurrence={issue} />
      {scores.length > 0 ? (
        <Inline as="p" className="flex-wrap">
          <span className="type-caption">Counts toward</span>
          {scores.map((score) => (
            <Tag key={score}>{score}</Tag>
          ))}
        </Inline>
      ) : null}
      <Inline className="flex-wrap">
        <AskAgentLink
          handoff={{
            issueGroup: { crawlId, groupId: issue.group_id, siteUrlId: issue.site_url_id },
            prompt: askAgentPrompt(head, issue.display_url),
            skillId: 'technical_health',
          }}
        />
        <CopyButton value={buildFixPrompt(head)} variant="secondary" className="w-fit">
          Copy fix prompt
        </CopyButton>
      </Inline>
    </>
  );
}

function Remediation({ issue }: Readonly<{ issue: PageIssue }>) {
  return issue.remediation ? (
    <p className="type-body text-ink whitespace-pre-line">{issue.remediation}</p>
  ) : null;
}

/** Recommendations: the section head says they are advisories, so the rows never repeat it. */
function Advisories({ advisories }: Readonly<{ advisories: readonly PageIssue[] }>) {
  return (
    <TitledSection title={`Advisories (${advisories.length})`}>
      <SectionContent>
        <DisclosureList>
          {advisories.map((issue) => (
            <IssueRow key={issue.occurrence_id} issue={issue}>
              <Remediation issue={issue} />
              <IssueEvidence occurrence={issue} />
            </IssueRow>
          ))}
        </DisclosureList>
      </SectionContent>
    </TitledSection>
  );
}

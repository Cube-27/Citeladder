import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { AskAgentLink } from '@/components/agent/ask-agent-link';
import { askAgentPrompt, buildFixPrompt } from '@/components/site-health/issue-detail-dialog';
import { IssueEvidence } from '@/components/site-health/issue-evidence';
import { Tag } from '@/components/ui/tag';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Inline, Stack } from '@/components/ui/layout';
import { Pressable } from '@/components/ui/pressable';
import { StatusMark } from '@/components/ui/status-mark';
import { textRole } from '@/components/ui/typography';
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
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';

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
      <Section>
        <SectionHeader>
          <SectionTitle>All issues ({defects.length})</SectionTitle>
        </SectionHeader>
        <SectionContent>
          {defects.length === 0 ? (
            <StateBlock
              kind="empty"
              inline
              message={
                audited
                  ? 'No issues found on this page.'
                  : 'Issues appear here once this page’s audit finishes.'
              }
            />
          ) : (
            <IssueList issues={defects} crawlId={crawlId} />
          )}
        </SectionContent>
      </Section>
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
      <IssueRows>
        {shown.map((issue) => (
          <IssueRow key={issue.occurrence_id} issue={issue}>
            <IssueBody issue={issue} crawlId={crawlId} />
          </IssueRow>
        ))}
      </IssueRows>
      {issues.length > PREVIEW_COUNT ? (
        <Button variant="quiet" className="w-fit" onClick={() => setExpanded(!expanded)}>
          <Icon icon={ChevronDown} className={cn(expanded && 'rotate-180')} />
          {expanded ? 'Show fewer issues' : `View all ${issues.length} issues`}
        </Button>
      ) : null}
    </Stack>
  );
}

/**
 * The rows' one grid: on a wide card title, severity, category and chevron
 * are columns every row shares (subgrid), so peers line up to the pixel; on a
 * narrow one severity and category drop to a subline under the title.
 */
function IssueRows({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="@container min-w-0">
      <ul className="divide-rule grid min-w-0 divide-y @[36rem]:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        {children}
      </ul>
    </div>
  );
}

const WIDE_CELL = '@[36rem]:row-start-1';

/** One issue: a disclosure row (40 tall, 56 with its subline) that opens its body in place. */
function IssueRow({ issue, children }: Readonly<{ issue: PageIssue; children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li className="grid min-w-0 @[36rem]:col-span-full @[36rem]:grid-cols-subgrid">
      <Pressable
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="focus-ring rounded-control hover:overlay-hover active:overlay-pressed grid min-h-14 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 text-start @[36rem]:col-span-full @[36rem]:min-h-10 @[36rem]:grid-cols-subgrid"
      >
        <span className={textRole('label', `text-ink col-start-1 min-w-0 truncate ${WIDE_CELL}`)}>
          {issue.issue_title}
        </span>
        <span className="col-start-1 row-start-2 flex min-w-0 items-center gap-3 @[36rem]:contents">
          {issue.finding_class === 'defect' ? (
            <span className={`@[36rem]:col-start-2 ${WIDE_CELL}`}>
              <StatusMark variant="severity" value={issue.severity}>
                {severityLabel(issue.severity)}
              </StatusMark>
            </span>
          ) : null}
          <span className={textRole('caption', `text-ink-2 @[36rem]:col-start-3 ${WIDE_CELL}`)}>
            {dimensionLabel(issue.dimension)}
          </span>
        </span>
        <Icon
          icon={ChevronDown}
          className={cn(
            'text-ink-2 col-start-2 row-span-2 row-start-1 transition-transform @[36rem]:col-start-4 @[36rem]:row-span-1',
            open && 'rotate-180',
          )}
        />
      </Pressable>
      <div
        id={panelId}
        hidden={!open}
        className="bg-well rounded-control mb-3 grid min-w-0 gap-3 px-4 py-3 @[36rem]:col-span-full"
      >
        {open ? children : null}
      </div>
    </li>
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
      <div className="flex flex-wrap gap-2">
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
      </div>
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
    <Section>
      <SectionHeader>
        <SectionTitle>{`Advisories (${advisories.length})`}</SectionTitle>
        <SectionDescription>Recommendations to consider.</SectionDescription>
      </SectionHeader>
      <SectionContent>
        <IssueRows>
          {advisories.map((issue) => (
            <IssueRow key={issue.occurrence_id} issue={issue}>
              <Remediation issue={issue} />
              <IssueEvidence occurrence={issue} />
            </IssueRow>
          ))}
        </IssueRows>
      </SectionContent>
    </Section>
  );
}

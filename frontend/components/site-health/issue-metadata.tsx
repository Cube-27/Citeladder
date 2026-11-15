import type { ReactNode } from 'react';

import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import { Inline } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import type { SiteIssue } from '@citeladder/contracts';
import { dimensionLabel, severityLabel } from '@/lib/site-health/issues';

type IssueFacts = Pick<SiteIssue, 'finding_class' | 'severity' | 'dimension'>;

/**
 * How severe an issue is: the app's severity mark (High negative, Medium
 * warning, Low neutral). An advisory has no severity, so it is a static tag.
 */
export function IssueSeverityMark({
  issue,
}: Readonly<{ issue: Pick<IssueFacts, 'finding_class' | 'severity'> }>) {
  return issue.finding_class === 'defect' ? (
    <StatusMark variant="severity" value={issue.severity}>
      {severityLabel(issue.severity)}
    </StatusMark>
  ) : (
    <Tag>Advisory</Tag>
  );
}

/** Which dimension the issue counts against, as a category tag. */
export function IssueCategoryTag({ issue }: Readonly<{ issue: Pick<IssueFacts, 'dimension'> }>) {
  return <Tag>{dimensionLabel(issue.dimension)}</Tag>;
}

/**
 * Severity and dimension on one line, shared by the summary rows, the detail
 * drawer and the page detail so a row and the panel it opens describe the
 * same issue alike. Callers append their own facts as `children`.
 */
export function IssueMetadata({
  issue,
  children,
}: Readonly<{
  issue: IssueFacts;
  children?: ReactNode;
}>) {
  return (
    <Inline as="span" className={textRole('body', 'text-ink-2 flex-wrap')}>
      <IssueSeverityMark issue={issue} />
      <IssueCategoryTag issue={issue} />
      {children}
    </Inline>
  );
}

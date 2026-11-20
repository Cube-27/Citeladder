import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
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

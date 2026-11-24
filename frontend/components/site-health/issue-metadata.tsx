import { StatusMark } from '@/components/ui/status-mark';
import type { SiteIssue } from '@citeladder/contracts';
import { severityLabel } from '@/lib/site-health/issues';

export function IssueSeverityMark({ issue }: Readonly<{ issue: Pick<SiteIssue, 'severity'> }>) {
  return (
    <StatusMark variant="severity" value={issue.severity}>
      {severityLabel(issue.severity)}
    </StatusMark>
  );
}

import type { SiteIssue } from '@citeladder/contracts';

import { dimensionLabel, issueTitle, severityLabel } from '@/lib/site-health/issues';

export function askAgentPrompt(
  issue: Pick<SiteIssue, 'title' | 'rule_id' | 'affected_url_count'>,
  page?: string,
): string {
  const count = issue.affected_url_count;
  const pages = count === 1 ? 'page' : 'pages';
  const scope = page ? ` on ${page}` : ` (${count} affected ${pages})`;
  return page
    ? `Analyze the Website issue "${issueTitle(issue)}"${scope} and propose exact page edits from the selected evidence.`
    : `Analyze the Website issue "${issueTitle(issue)}"${scope}, prioritize the work and propose a bounded implementation plan from the supplied sample; say how many pages it covers versus the total.`;
}

export function buildFixPrompt(
  issue: Pick<
    SiteIssue,
    'title' | 'rule_id' | 'dimension' | 'severity' | 'description' | 'remediation'
  >,
): string {
  const lines = [
    `Fix this Website issue on my website: "${issueTitle(issue)}" (${dimensionLabel(issue.dimension)}, ${severityLabel(issue.severity)} severity).`,
  ];
  if (issue.description) lines.push('', 'The check passes when:', issue.description);
  if (issue.remediation) lines.push('', 'Recommended remediation:', issue.remediation);
  return lines.join('\n');
}

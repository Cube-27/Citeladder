import type { IssueOccurrence } from '@citeladder/contracts';
import { Text } from '@/components/ui/typography';
import { evidenceFacts, evidenceLead } from '@/lib/site-health/issue-evidence';

export function IssueEvidence({ occurrence }: Readonly<{ occurrence: IssueOccurrence }>) {
  const facts = evidenceFacts(occurrence.rule_id, occurrence.evidence, {
    pageUrl: occurrence.normalized_url,
  });
  if (facts.length === 0) return null;
  return <EvidenceLine lead={evidenceLead(occurrence.rule_id)} facts={facts} />;
}

export function EvidenceLine({
  lead,
  facts,
  text: role = 'caption',
}: Readonly<{ lead: string | null; facts: readonly string[]; text?: 'caption' | 'body' }>) {
  if (!lead)
    return (
      <Text as="p" variant={role} wrap="anywhere">
        <code>{facts.join(', ')}</code>
      </Text>
    );
  return (
    <Text as="div" variant={role} box="shrink" wrap="anywhere">
      <span>{lead}</span>
      <ul>
        {facts.map((fact) => (
          <li key={fact}>
            <code>{fact}</code>
          </li>
        ))}
      </ul>
    </Text>
  );
}

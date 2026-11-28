import type { AccuracyClaim } from '@citeladder/contracts/fact-checking';

import { AnswerLink } from '@/components/runs/answer-link';
import { EditedMark, VerdictChip } from '@/components/runs/evidence-claims';
import { Absence } from '@/components/ui/absence';
import type { DataTableColumn } from '@/components/ui/data-table-columns';
import { Inline } from '@/components/ui/layout';
import { StatusMark } from '@/components/ui/status-mark';
import { TableCell, TableRow } from '@/components/ui/table';
import { useEngineCatalog } from '@/lib/providers/engines';
import { TOPIC_LABELS, VERDICT_TONE } from '@/lib/visibility/accuracy';
import { Text } from '@/components/ui/typography';
import { ClampText } from '@/components/ui/clamp-text';

export const CLAIM_COLUMNS = [
  { key: 'prompt', label: 'Prompt', kind: 'identity' },
  { key: 'quote', label: 'Answer said' },
  { key: 'fact', label: 'Your fact' },
  { key: 'verdict', label: 'Verdict', width: 'category' },
  { key: 'engine', label: 'Engine', width: 'shortMetric' },
] as const satisfies readonly DataTableColumn[];

export const CONTRADICTED_COLUMNS = CLAIM_COLUMNS.map((column) =>
  column.key === 'verdict' ? { ...column, label: 'Topic' } : column,
) satisfies readonly DataTableColumn[];

export function claimKey(claim: AccuracyClaim): string {
  return `${claim.execution_id}:${claim.claim}:${claim.quote}`;
}

export function ClaimRow({
  claim,
  facet = 'verdict',
}: Readonly<{ claim: AccuracyClaim; facet?: 'verdict' | 'topic' }>) {
  const { label: engineLabel } = useEngineCatalog();
  const facts = claim.facts.map((fact) => fact.statement).join('; ');
  return (
    <TableRow>
      <TableCell>
        <ClampText>
          <AnswerLink answer={claim} text="inherit">
            {claim.prompt}
          </AnswerLink>
        </ClampText>
      </TableCell>
      <TableCell>
        <ClampText>
          <AnswerLink answer={claim} text="inherit" tone="muted">
            “{claim.quote}”
          </AnswerLink>
        </ClampText>
      </TableCell>
      <TableCell>
        {facts ? (
          <Text variant="body" tone="ink-2" box="block" wrap="truncate" title={facts}>
            {facts}
          </Text>
        ) : (
          <Absence label="No fact on this point" />
        )}
      </TableCell>
      <TableCell>
        <Inline gap="tight">
          {facet === 'topic' ? (
            <StatusMark
              variant="sentiment"
              value={claim.verdict ? VERDICT_TONE[claim.verdict] : 'neutral'}
            >
              {TOPIC_LABELS[claim.topic]}
            </StatusMark>
          ) : (
            <VerdictChip claim={claim} />
          )}
          <EditedMark edited={claim.edited} />
        </Inline>
      </TableCell>
      <TableCell>{engineLabel(claim.logical_engine)}</TableCell>
    </TableRow>
  );
}

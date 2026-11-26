import type { ExecutionClaim } from '@citeladder/contracts/fact-checking';
import { useState } from 'react';

import { VerdictDialog } from '@/components/perception/verdict-dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tooltip } from '@/components/ui/tooltip';
import { PenLine } from '@/lib/icons';

import { Absence } from '@/components/ui/absence';
import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import { Inline, Stack } from '@/components/ui/layout';
import { Section, SectionBleed, SectionHeader, SectionTitle } from '@/components/ui/section';
import { textRole } from '@/components/ui/typography';
import type { Highlight } from '@/lib/markdown/highlight';
import { TOPIC_LABELS, VERDICT_LABELS, VERDICT_TONE } from '@/lib/visibility/accuracy';

export function claimHighlights(claims: readonly ExecutionClaim[]): Highlight[] {
  return claims.flatMap((claim): Highlight[] => {
    if (claim.verdict === 'supported') return [{ text: claim.quote, tone: 'positive' }];
    if (claim.verdict === 'contradicted') return [{ text: claim.quote, tone: 'negative' }];
    return [];
  });
}

const STATE_WORDS: Record<Exclude<ExecutionClaim['status'], 'verdict' | 'unavailable'>, string> = {
  low_confidence: 'Low confidence',
  pending: 'Checking…',
};

export function VerdictChip({
  claim,
}: Readonly<{ claim: Pick<ExecutionClaim, 'status' | 'verdict'> }>) {
  if (claim.status === 'verdict' && claim.verdict)
    return (
      <StatusMark variant="sentiment" value={VERDICT_TONE[claim.verdict]}>
        {VERDICT_LABELS[claim.verdict]}
      </StatusMark>
    );
  if (claim.status === 'unavailable') return <Absence state="unavailable" />;
  return <Tag>{claim.status === 'verdict' ? 'Unchecked' : STATE_WORDS[claim.status]}</Tag>;
}

export function EditedMark({ edited }: Readonly<{ edited: ExecutionClaim['edited'] }>) {
  if (!edited) return null;
  return (
    <Tooltip content={`Model said ${VERDICT_LABELS[edited.model_verdict]}`}>
      <span className="inline-flex">
        <Tag>Edited</Tag>
      </span>
    </Tooltip>
  );
}

export function EvidenceClaims({ claims }: Readonly<{ claims: readonly ExecutionClaim[] }>) {
  const [editing, setEditing] = useState<ExecutionClaim | null>(null);
  if (!claims.length) return null;
  return (
    <Section>
      <SectionHeader>
        <SectionTitle level={3}>Fact checks</SectionTitle>
      </SectionHeader>
      <SectionBleed as="ul" rows>
        {claims.map((claim) => (
          <Stack as="li" gap="tight" key={`${claim.start}:${claim.end}:${claim.topic}`}>
            <Inline as="span" className="flex-wrap">
              <span className={textRole('emphasis')}>“{claim.quote}”</span>
              <VerdictChip claim={claim} />
              <EditedMark edited={claim.edited} />
              {claim.verdict_id ? (
                <Button variant="quiet" onClick={() => setEditing(claim)}>
                  <Icon icon={PenLine} />
                  Change verdict
                </Button>
              ) : null}
            </Inline>
            <span className="text-caption text-ink-2">
              {TOPIC_LABELS[claim.topic]}: {claim.claim}
            </span>
            {claim.facts.map((fact) => (
              <span key={fact.statement} className="text-caption text-ink-2">
                Your fact: {fact.statement}
              </span>
            ))}
          </Stack>
        ))}
      </SectionBleed>
      {editing ? <VerdictDialog claim={editing} onClose={() => setEditing(null)} /> : null}
    </Section>
  );
}

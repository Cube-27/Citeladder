import type { ExecutionPerception } from '@citeladder/contracts/visibility-perception';

import { Absence } from '@/components/ui/absence';
import { RailItem, RailLine, RailList, RailSection } from '@/components/ui/answer-chat';
import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import { Inline, Stack } from '@/components/ui/layout';
import { Text } from '@/components/ui/typography';
import type { Highlight } from '@/lib/markdown/highlight';
import { Section, SectionBleed, SectionHeader, SectionTitle } from '@/components/ui/section';

const SENTIMENT_LABELS = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  mixed: 'Mixed',
} as const;

export function perceptionHighlights(perception: readonly ExecutionPerception[]): Highlight[] {
  return perception.flatMap((entity) =>
    entity.state === 'classified'
      ? entity.aspects.map((aspect) => ({ text: aspect.quote, tone: aspect.polarity }))
      : [],
  );
}

const STATE_WORDS: Record<
  Exclude<ExecutionPerception['state'], 'classified' | 'unavailable'>,
  string
> = {
  not_assessable: 'Not assessable',
  low_confidence: 'Low confidence',
  pending: 'Classifying…',
};

function PerceptionChip({ entity }: Readonly<{ entity: ExecutionPerception }>) {
  const label = entity.label;
  if (entity.state === 'classified' && label && label !== 'not_assessable')
    return (
      <StatusMark variant="sentiment" value={label}>
        {SENTIMENT_LABELS[label]}
      </StatusMark>
    );
  if (entity.state === 'unavailable') return <Absence state="unavailable" />;
  return (
    <Tag>
      {entity.state === 'classified' ? STATE_WORDS.not_assessable : STATE_WORDS[entity.state]}
    </Tag>
  );
}

export function EvidencePerception({
  perception,
}: Readonly<{ perception: readonly ExecutionPerception[] }>) {
  if (!perception.length) return null;
  return (
    <Section>
      <SectionHeader>
        <SectionTitle level={3}>Perception</SectionTitle>
      </SectionHeader>
      <SectionBleed as="ul" rows>
        {perception.map((entity) => (
          <Stack as="li" gap="tight" key={entity.entity}>
            <Inline as="span" wrap>
              <Text variant="label">{entity.entity}</Text>
              {entity.is_brand ? <Text variant="caption">You</Text> : null}
              <PerceptionChip entity={entity} />
            </Inline>
            {entity.state === 'classified'
              ? entity.aspects.map((aspect) => (
                  <Text key={`${aspect.start}:${aspect.end}`} variant="caption">
                    {aspect.theme} ({aspect.polarity}): “{aspect.quote}”
                  </Text>
                ))
              : null}
          </Stack>
        ))}
      </SectionBleed>
    </Section>
  );
}

export function AttributesRail({
  perception,
}: Readonly<{ perception: readonly ExecutionPerception[] }>) {
  const own = perception.find((entity) => entity.is_brand && entity.state === 'classified');
  const labelled = (own?.aspects ?? []).flatMap((aspect) =>
    aspect.attribute.kind === 'labelled'
      ? [
          {
            key: `${aspect.start}:${aspect.end}`,
            name: aspect.attribute.name,
            polarity: aspect.polarity,
          },
        ]
      : [],
  );
  if (!labelled.length) return null;
  return (
    <RailSection title="Attributes" count={labelled.length}>
      <RailList label="Attributes" dense>
        {labelled.map((attribute) => (
          <RailItem key={attribute.key}>
            <RailLine>
              <Text variant="body" box="fill" wrap="truncate" title={attribute.name}>
                {attribute.name}
              </Text>
              <StatusMark variant="sentiment" value={attribute.polarity}>
                {SENTIMENT_LABELS[attribute.polarity]}
              </StatusMark>
            </RailLine>
          </RailItem>
        ))}
      </RailList>
    </RailSection>
  );
}

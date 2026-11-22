import { useEffect, useState } from 'react';
import type {
  PerceptionCoverage,
  PerceptionQuote,
  PerceptionResponse,
} from '@citeladder/contracts/visibility-perception';

import { AnswerLink } from '@/components/runs/answer-link';
import { BrandMark } from '@/components/ui/brand-mark';
import { StatusMark } from '@/components/ui/status-mark';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Inline, Stack } from '@/components/ui/layout';
import { ClampText } from '@/components/ui/clamp-text';
import { TableCell, TableRow, YouTag } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { MessageSquareQuote } from '@/lib/icons';
import { useEngineCatalog } from '@/lib/providers/engines';
import { coverageLine, stateCopy } from '@/lib/visibility/perception';
import { SentimentValue } from '@/components/visibility/sentiment-value';
import { StateBlock } from '@/components/ui/state-block';
import { SectionContent, TitledSection } from '@/components/ui/section';
import { slipClasses } from '@/components/ui/slip';

export function PerceptionState({
  state,
  reason,
  coverage,
}: Readonly<{
  state: Exclude<PerceptionResponse['state'], 'value'>;
  reason: PerceptionResponse['reason'];
  coverage?: PerceptionCoverage;
}>) {
  const copy = stateCopy(state, reason);
  const counted = coverage?.mentions ? coverageLine(coverage) : null;
  return (
    <StateBlock
      kind="empty"
      headingLevel={3}
      icon={MessageSquareQuote}
      heading={copy.heading}
      description={[copy.description, counted].filter(Boolean).join(' ') || undefined}
    />
  );
}

export function EntityTable({ entities }: Readonly<{ entities: PerceptionResponse['entities'] }>) {
  return (
    <TitledSection title="You and competitors">
      <DataTable label="You and competitors" columns={ENTITY_COLUMNS}>
        {entities.map((entity) => (
          <TableRow key={entity.name} highlight={entity.is_brand}>
            <TableCell>
              <Inline as="span">
                <BrandMark
                  name={entity.name}
                  logoUrl={entity.logo_url}
                  websiteUrl={entity.website_url}
                />
                <ClampText>{entity.name}</ClampText>
                {entity.is_brand ? <YouTag /> : null}
              </Inline>
            </TableCell>
            <TableCell numeric>
              {entity.score.classified} of {entity.coverage.mentions}
            </TableCell>
            <TableCell numeric>{entity.score.positive}</TableCell>
            <TableCell numeric>{entity.score.negative}</TableCell>
            <TableCell numeric>
              <SentimentValue
                sentiment={{ ...entity.score, mentions: entity.coverage.mentions }}
                tooFew="Too few"
                showCount={false}
              />
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}

const ENTITY_COLUMNS: readonly DataTableColumn[] = [
  { key: 'business', label: 'Business' },
  { key: 'classified', label: 'Classified', width: 'figure', kind: 'number', priority: 'low' },
  { key: 'positive', label: 'Positive', width: 'figure', kind: 'number' },
  { key: 'negative', label: 'Negative', width: 'figure', kind: 'number' },
  { key: 'net', label: 'Net sentiment', width: 'figure', kind: 'number', priority: 'low' },
];

export function QuoteLink({ quote }: Readonly<{ quote: PerceptionQuote }>) {
  return <AnswerLink answer={quote}>“{quote.text}”</AnswerLink>;
}

const SCROLL_REGION = { role: 'region', tabIndex: 0 } as const;

function useOverflowsY(node: HTMLElement | null) {
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setOverflows(node.scrollHeight - node.clientHeight > 1),
    );
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, [node]);
  return overflows;
}

export function NegativeQuotes({ quotes }: Readonly<{ quotes: PerceptionQuote[] }>) {
  const { label: engineLabel } = useEngineCatalog();
  const title = 'Criticism in answers';
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const scrolls = useOverflowsY(scroller) && quotes.length > 0;
  return (
    <TitledSection
      title={title}
      actions={
        quotes.length ? (
          <span className={textRole('body', 'text-ink-2')}>
            {quotes.length === 1 ? '1 quote' : `${quotes.length} quotes`}
          </span>
        ) : undefined
      }
    >
      {!quotes.length ? (
        <SectionContent className={slipClasses()}>
          <StateBlock
            kind="empty"
            inline
            message="No negative points about you in these answers."
          />
        </SectionContent>
      ) : (
        <div
          ref={setScroller}
          {...(scrolls ? SCROLL_REGION : {})}
          aria-label={scrolls ? title : undefined}
          className={slipClasses(
            'column-wide:max-h-120 column-wide:overflow-y-auto overscroll-contain py-0',
          )}
        >
          <ul className="divide-rule divide-y">
            {quotes.map((quote) => (
              <Stack
                as="li"
                gap="tight"
                className="py-3"
                key={`${quote.execution_id}:${quote.text}`}
              >
                <QuoteLink quote={quote} />
                <Inline as="span" className={textRole('caption', 'text-ink-2 flex-wrap')}>
                  <StatusMark variant="sentiment" value="negative">
                    {quote.theme}
                  </StatusMark>
                  {engineLabel(quote.logical_engine)} ·{' '}
                  <AnswerLink answer={quote} text="inherit" tone="muted">
                    {quote.prompt}
                  </AnswerLink>
                </Inline>
              </Stack>
            ))}
          </ul>
        </div>
      )}
    </TitledSection>
  );
}

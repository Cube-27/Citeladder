import { useState, type ReactNode } from 'react';

import { ExecutionEvidenceDrawer } from '@/components/runs/execution-evidence-drawer';
import { StatusMark, type StatusValue } from '@/components/ui/status-mark';
import { Button } from '@/components/ui/button';
import { DisplayTime } from '@/components/ui/display-time';
import { Inline, Stack } from '@/components/ui/layout';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import { Value } from '@/components/ui/value';
import type { CommerceProductDetail } from '@citeladder/contracts/commerce-suite';
import { formatCount, pluralCount } from '@/lib/format';
import { formatPosition, formatRate, holderCaption } from '@/lib/products/product-columns';
import { productHref, type ProductScopeFilters } from '@/lib/products/product-filters';
import { useEngineCatalog } from '@/lib/providers/engines';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';

type Answer = CommerceProductDetail['answers'][number];

const OUTCOMES: Record<Answer['outcome'], { label: string; tone: StatusValue }> = {
  won: { label: 'Won', tone: 'success' },
  lost: { label: 'Lost', tone: 'danger' },
  unranked: { label: 'Unranked', tone: 'info' },
};

/** One titled card holding a ledger, or a sentence when the ledger is empty. */
function ProductSection({
  title,
  description,
  empty,
  children,
}: Readonly<{ title: string; description: string; empty: string | null; children: ReactNode }>) {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>{title}</SectionTitle>
        <SectionDescription>{description}</SectionDescription>
      </SectionHeader>
      <SectionContent>
        {empty === null ? (
          <ul className={ledgerClasses()}>{children}</ul>
        ) : (
          <p className={textRole('body', 'text-ink-2')}>{empty}</p>
        )}
      </SectionContent>
    </Section>
  );
}

function Row({
  primary,
  secondary,
  end,
}: Readonly<{ primary: ReactNode; secondary?: ReactNode; end?: ReactNode }>) {
  return (
    <Inline as="li" gap="compact" className={ledgerItemClasses('flex-wrap')}>
      <Stack gap="tight" className="min-w-0 flex-1">
        <span className={textRole('emphasis', 'relative block min-w-0 truncate')}>{primary}</span>
        {secondary ? <span className="type-caption">{secondary}</span> : null}
      </Stack>
      {end}
    </Inline>
  );
}

export function CompetingProducts({
  detail,
  scope,
}: Readonly<{ detail: CommerceProductDetail; scope: ProductScopeFilters }>) {
  const rows = detail.competing;
  return (
    <ProductSection
      title="Competing products"
      description="Products named in the same answers, by answers shared."
      empty={rows.length ? null : 'No other product was named in its answers.'}
    >
      {rows.map((row) => (
        <Row
          key={row.holder_id}
          primary={
            <TextLink href={productHref(row.holder_id, scope)} text="inherit">
              {row.name}
            </TextLink>
          }
          secondary={[
            holderCaption(row),
            `In ${pluralCount(row.shared, 'shared answer')}`,
            `ranked above it in ${formatCount(row.ahead)}`,
          ].join(' · ')}
          end={
            <span className="type-caption tabular-nums">
              Position{' '}
              <Value
                value={row.position === null ? null : formatPosition(row.position)}
                absent="unavailable"
              />
            </span>
          }
        />
      ))}
    </ProductSection>
  );
}

export function Merchants({ detail }: Readonly<{ detail: CommerceProductDetail }>) {
  return (
    <ProductSection
      title="Merchants"
      description="Where the answers send shoppers to buy it."
      empty={detail.merchants.length ? null : 'No answer named a merchant for it.'}
    >
      {detail.merchants.map((row) => (
        <Row
          key={row.domain}
          primary={row.domain}
          end={
            <span className="type-caption tabular-nums">{pluralCount(row.count, 'answer')}</span>
          }
        />
      ))}
    </ProductSection>
  );
}

export function SeenIn({
  detail,
  scope,
}: Readonly<{ detail: CommerceProductDetail; scope: ProductScopeFilters }>) {
  return (
    <ProductSection
      title="Seen in"
      description="The categories and products whose shopping prompts named it."
      empty={detail.seen_in.length ? null : 'No shopping prompt’s answer named it.'}
    >
      {detail.seen_in.map((row) => (
        <Row
          key={row.target_id}
          primary={
            <TextLink href={productHref(row.target_id, scope)} text="inherit">
              {row.name}
            </TextLink>
          }
          secondary={row.target_kind === 'category' ? 'Category' : 'Product'}
          end={
            <span className="type-caption tabular-nums">{pluralCount(row.answers, 'answer')}</span>
          }
        />
      ))}
    </ProductSection>
  );
}

export function Sources({ detail }: Readonly<{ detail: CommerceProductDetail }>) {
  return (
    <ProductSection
      title="Sources"
      description="Pages cited by the answers that named it."
      empty={detail.sources.length ? null : 'The answers that named it cited no pages.'}
    >
      {detail.sources.map((row) => (
        <Row
          key={row.url}
          primary={
            <TextLink variant="external" href={row.url} text="inherit">
              {row.title || row.url}
            </TextLink>
          }
          secondary={row.domain}
          end={
            <span className="type-caption tabular-nums">{pluralCount(row.count, 'answer')}</span>
          }
        />
      ))}
    </ProductSection>
  );
}

export function FanOutQueries({ detail }: Readonly<{ detail: CommerceProductDetail }>) {
  return (
    <ProductSection
      title="Fan-out queries"
      description="What the engines searched for while writing the answers that named it."
      empty={
        detail.fan_out_queries.length
          ? null
          : 'No search queries were captured for the answers that named it.'
      }
    >
      {detail.fan_out_queries.map((row) => (
        <Row
          key={row.query}
          primary={row.query}
          end={
            <span className="type-caption tabular-nums">{pluralCount(row.count, 'answer')}</span>
          }
        />
      ))}
    </ProductSection>
  );
}

export function PromptMetrics({ detail }: Readonly<{ detail: CommerceProductDetail }>) {
  return (
    <ProductSection
      title="Prompts"
      description="Each prompt that named it or targets it, over that prompt's answers."
      empty={detail.prompts.length ? null : 'No prompt named it in this window.'}
    >
      {detail.prompts.map((row) => (
        <Row
          key={row.prompt_id ?? row.text}
          primary={row.text}
          secondary={
            <>
              Visibility{' '}
              <Value
                value={row.visibility === null ? null : formatRate(row.visibility)}
                absent="unavailable"
              />{' '}
              ({formatCount(row.appearances)} of {pluralCount(row.executions, 'answer')}) · Win rate{' '}
              <Value
                value={row.win_rate === null ? null : formatRate(row.win_rate)}
                absent="unavailable"
              />{' '}
              · Position{' '}
              <Value
                value={row.position === null ? null : formatPosition(row.position)}
                absent="unavailable"
              />
            </>
          }
        />
      ))}
    </ProductSection>
  );
}

/** Each answer that named it, newest first; opening one shows the stored answer. */
export function Answers({ detail }: Readonly<{ detail: CommerceProductDetail }>) {
  const [open, setOpen] = useState<Answer | null>(null);
  const engines = useEngineCatalog();
  const more = detail.answer_total - detail.answers.length;
  return (
    <>
      <ProductSection
        title="Answers"
        description={
          more > 0
            ? `The newest ${formatCount(detail.answers.length)} of ${pluralCount(detail.answer_total, 'answer')} that named it.`
            : 'Every answer that named it, newest first.'
        }
        empty={detail.answers.length ? null : 'No answer named it in this window.'}
      >
        {detail.answers.map((row) => (
          <Row
            key={row.task_id}
            primary={row.prompt_text}
            secondary={
              <>
                {engines.label(row.engine)} · <DisplayTime value={row.completed_at} dateOnly />
                {row.rank === null ? null : ` · #${row.rank}`}
              </>
            }
            end={
              <Inline gap="compact">
                <StatusMark variant="status" value={OUTCOMES[row.outcome].tone}>
                  {OUTCOMES[row.outcome].label}
                </StatusMark>
                <Button variant="quiet" onClick={() => setOpen(row)}>
                  Open answer
                </Button>
              </Inline>
            }
          />
        ))}
      </ProductSection>
      <ExecutionEvidenceDrawer
        execution={open ? { id: open.task_id, prompt_text: open.prompt_text } : null}
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      />
    </>
  );
}

import { useState, type ReactNode } from 'react';

import { AnswerDialog } from '@/components/runs/answer-dialog';
import { BrandMark } from '@/components/ui/brand-mark';
import { Inline } from '@/components/ui/layout';
import { StatusMark, type StatusValue } from '@/components/ui/status-mark';
import { DisplayTime } from '@/components/ui/display-time';
import { LedgerItem, LedgerList } from '@/components/ui/ledger-list';
import { OpenRow } from '@/components/ui/list-row';
import { StateBlock } from '@/components/ui/state-block';
import { TextLink } from '@/components/ui/text-link';
import { Value } from '@/components/ui/value';
import type { CommerceProductDetail } from '@citeladder/contracts/commerce-suite';
import { formatCount, formatMean, pluralCount } from '@/lib/format';
import { formatRate, holderCaption } from '@/lib/products/product-columns';
import { productHref, type ProductScopeFilters } from '@/lib/products/product-filters';
import { useEngineCatalog } from '@/lib/providers/engines';
import { SectionContent, TitledSection } from '@/components/ui/section';

type Answer = CommerceProductDetail['answers'][number];

const OUTCOMES: Record<Answer['outcome'], { label: string; tone: StatusValue }> = {
  won: { label: 'Won', tone: 'success' },
  lost: { label: 'Lost', tone: 'danger' },
  unranked: { label: 'Unranked', tone: 'info' },
};

/** One titled section holding a ledger, or a sentence when the ledger is empty. */
function ProductSection({
  title,
  description,
  empty,
  children,
}: Readonly<{ title: string; description?: string; empty: string | null; children: ReactNode }>) {
  return (
    <TitledSection title={title} description={description}>
      <SectionContent>
        {empty === null ? (
          <LedgerList>{children}</LedgerList>
        ) : (
          <StateBlock kind="empty" inline message={empty} />
        )}
      </SectionContent>
    </TitledSection>
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
      empty={rows.length ? null : 'No other product was named in its answers.'}
    >
      {rows.map((row) => (
        <LedgerItem
          key={row.holder_id}
          title={
            <TextLink href={productHref(row.holder_id, scope)} text="inherit" underline="hover">
              {row.name}
            </TextLink>
          }
          caption={
            <Inline as="span" gap="tight">
              {row.brand ? <BrandMark name={row.brand} placement="inline" /> : null}
              <span className="truncate">
                {[
                  holderCaption(row),
                  `In ${pluralCount(row.shared, 'shared answer')}`,
                  `ranked above it in ${formatCount(row.ahead)}`,
                ].join(' · ')}
              </span>
            </Inline>
          }
          meta={
            <span className="type-caption tabular-nums">
              Position{' '}
              <Value
                value={row.position === null ? null : formatMean(row.position)}
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
      empty={detail.merchants.length ? null : 'No answer named a merchant for it.'}
    >
      {detail.merchants.map((row) => (
        <LedgerItem
          key={row.domain}
          title={row.domain}
          meta={
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
      empty={detail.seen_in.length ? null : 'No shopping prompt’s answer named it.'}
    >
      {detail.seen_in.map((row) => (
        <LedgerItem
          key={row.target_id}
          title={
            <TextLink href={productHref(row.target_id, scope)} text="inherit" underline="hover">
              {row.name}
            </TextLink>
          }
          caption={row.target_kind === 'category' ? 'Category' : 'Product'}
          meta={
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
      empty={detail.sources.length ? null : 'The answers that named it cited no pages.'}
    >
      {detail.sources.map((row) => (
        <LedgerItem
          key={row.url}
          title={
            <TextLink variant="external" href={row.url} text="inherit">
              {row.title || row.url}
            </TextLink>
          }
          caption={row.domain}
          meta={
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
      empty={
        detail.fan_out_queries.length
          ? null
          : 'No search queries were captured for the answers that named it.'
      }
    >
      {detail.fan_out_queries.map((row) => (
        <LedgerItem
          key={row.query}
          title={row.query}
          meta={
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
      empty={detail.prompts.length ? null : 'No prompt named it in this window.'}
    >
      {detail.prompts.map((row) => (
        <LedgerItem
          key={row.prompt_id ?? row.text}
          title={row.text}
          caption={
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
                value={row.position === null ? null : formatMean(row.position)}
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
            : undefined
        }
        empty={detail.answers.length ? null : 'No answer named it in this window.'}
      >
        {/* The row opens its stored answer; its chevron says so at rest. */}
        {detail.answers.map((row) => (
          <li key={row.task_id}>
            <OpenRow
              title={row.prompt_text}
              caption={
                <>
                  {engines.label(row.engine)} · <DisplayTime value={row.completed_at} dateOnly />
                  {row.rank === null ? null : ` · #${row.rank}`}
                </>
              }
              meta={
                <StatusMark variant="status" value={OUTCOMES[row.outcome].tone}>
                  {OUTCOMES[row.outcome].label}
                </StatusMark>
              }
              onOpen={() => setOpen(row)}
            />
          </li>
        ))}
      </ProductSection>
      <AnswerDialog
        execution={open ? { id: open.task_id, prompt_text: open.prompt_text } : null}
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      />
    </>
  );
}

import type { UseQueryResult } from '@tanstack/react-query';

import { BusyRung } from '@/components/ui/rung-meter';
import { Absence } from '@/components/ui/absence';
import { BrandMark } from '@/components/ui/brand-mark';
import { Inline, Stack } from '@/components/ui/layout';
import { SubsectionHeader } from '@/components/ui/workspace';
import { LedgerItem, LedgerList } from '@/components/ui/ledger-list';
import { formatPercent } from '@/lib/format';
import type { AioRate, SurfaceRates } from '@citeladder/contracts';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';

/**
 * The five AI Overview rates, each shown with what it divided by.
 *
 * These answer different questions and are easy to confuse. With 100
 * successful observations, 40 overviews and 10 naming the brand: the trigger
 * rate is 40%, the conditional mention rate is 25%, and overall visibility is
 * 10%. All three are true and none of them alone is "how visible are we", so
 * every tile here states its denominator in words underneath the number.
 *
 * A rate with nothing to divide is UNAVAILABLE, never 0%. A zero would be a
 * measurement claim nobody made.
 */

// The template already supplies the "of" between the two numbers, so each
// value here starts at the noun. Carrying a second "of" rendered every tile
// as "40 of 100 of searches we successfully observed".
const DENOMINATOR_COPY: Record<string, string> = {
  successful_observations: 'searches we successfully observed',
  observations_with_ai_overview: 'searches that showed an overview',
};

function denominatorCopy(rate: AioRate): string {
  const scope = DENOMINATOR_COPY[rate.denominator_kind] ?? 'observations counted';
  return `${rate.numerator} of ${rate.denominator} ${scope}`;
}

/**
 * One rate as a stat: the figure, what it divided by, and what it means. A rate
 * with nothing to divide is the missing mark named "Unavailable", never 0%.
 */
function rateStat({
  key,
  label,
  caption,
  rate,
}: Readonly<{ key: string; label: string; caption: string; rate: AioRate }>): FigureSegment {
  return {
    key,
    label,
    value: rate.value === null ? null : formatPercent(rate.value),
    missingState: 'unavailable',
    sub: (
      <>
        <span className="block">
          {rate.value === null
            ? 'Nothing to divide by yet: no observation has entered this denominator.'
            : denominatorCopy(rate)}
        </span>
        <span className="block">{caption}</span>
      </>
    ),
  };
}

function CompetitorRates({ rates }: Readonly<{ rates: SurfaceRates['competitor_mention_rates'] }>) {
  if (rates.length === 0) return null;
  return (
    <Stack as="section" gap="item">
      <SubsectionHeader
        title="Competitors, when an overview appeared"
        description="Over the same denominator as your own conditional mention rate, so the two are comparable."
      />
      <LedgerList label="Competitors, when an overview appeared">
        {rates.map((entry) => (
          <LedgerItem
            key={entry.name}
            title={
              <Inline as="span">
                <BrandMark
                  name={entry.name}
                  logoUrl={entry.logo_url}
                  websiteUrl={entry.website_url}
                />
                {entry.name}
              </Inline>
            }
            meta={
              entry.rate.value === null ? (
                <Absence state="unavailable" className="type-body text-ink-2" />
              ) : (
                <>
                  <span className="type-body tabular-nums">{formatPercent(entry.rate.value)}</span>
                  {/* The denominator is stated once for the list above; the
                      numerator is not, and it is what separates one competitor
                      named in a single overview from one named in fifty. */}
                  <span className="type-caption tabular-nums">
                    {`${entry.rate.numerator} of ${entry.rate.denominator}`}
                  </span>
                </>
              )
            }
          />
        ))}
      </LedgerList>
    </Stack>
  );
}

export function SurfaceRatesPanel({
  query,
}: Readonly<{ query: UseQueryResult<SurfaceRates, unknown> }>) {
  const data = query.data;
  if (query.isError)
    return (
      <Notice
        kind="read"
        {...readErrorProps(query)}
        title="Couldn't load the AI Overview rates"
        fallback="The request failed or timed out."
      />
    );
  if (!data)
    return (
      <StateBlock
        kind="loading"
        label="Loading AI Overview rates…"
        shape={{ kind: 'figures', count: 4 }}
      />
    );
  // These rates are RETAINED across a surface or run change, the same way
  // the sources and evidence panels retain theirs, so the reader is not
  // handed a skeleton for every round trip. Retained numbers carry no
  // shape of their own to recognise, though -- five percentages look
  // equally plausible under any selection -- so the busy bar every other
  // retaining panel shows is what keeps them from reading as settled.
  return (
    <Section className="relative" aria-busy={query.isFetching}>
      <BusyRung active={query.isFetching} label="Updating AI Overview rates" />
      <SectionHeader>
        <SectionTitle>Google AI Overview</SectionTitle>
        <SectionDescription>
          {`${data.successful} successfully observed ${data.successful === 1 ? 'search' : 'searches'}, ${data.with_overview} of which showed an overview. Each rate below states what it divided by.`}
        </SectionDescription>
      </SectionHeader>
      <SectionContent>
        <Stack gap="workspace">
          <FigureStrip
            segments={[
              rateStat({
                key: 'trigger',
                label: 'Overview shown',
                caption:
                  'A property of the QUERIES, not of your brand. It moves when Google changes what it answers with.',
                rate: data.trigger_rate,
              }),
              rateStat({
                key: 'named',
                label: 'Named, when shown',
                caption:
                  'Conditional. It can rise while overall visibility falls, if Google shows fewer overviews but names you in more of them.',
                rate: data.brand_mention_rate_when_present,
              }),
              rateStat({
                key: 'overall',
                label: 'Overall visibility',
                caption:
                  "Unconditional, and the closest to 'how visible are we here'. A search with no overview counts against it.",
                rate: data.overall_brand_visibility,
              }),
              rateStat({
                key: 'cited',
                label: 'Your site cited',
                caption:
                  'Independent of being named: an overview can name you without citing you, and cite you without naming you.',
                rate: data.owned_citation_rate_when_present,
              }),
            ]}
          />
          <CompetitorRates rates={data.competitor_mention_rates} />
        </Stack>
      </SectionContent>
    </Section>
  );
}

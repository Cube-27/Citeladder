'use client';

import type { UseQueryResult } from '@tanstack/react-query';

import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, textRole } from '@/components/ui/typography';
import { ledgerClasses } from '@/components/ui/workspace';
import type { AioRate, SurfaceRates } from '@/lib/api/types';

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

function RateTile({
  label,
  caption,
  rate,
}: Readonly<{ label: string; caption: string; rate: AioRate }>) {
  return (
    <div className="grid min-w-0 gap-1 p-4">
      <Label>{label}</Label>
      {rate.value === null ? (
        <>
          <span className={textRole('bodyStrong', 'text-muted')}>Unavailable</span>
          <span className="text-muted text-xs">
            Nothing to divide by yet — no observation has entered this denominator.
          </span>
        </>
      ) : (
        <>
          <span className={textRole('metric')}>{Math.round(rate.value * 1000) / 10}%</span>
          <span className="text-muted text-xs">{denominatorCopy(rate)}</span>
        </>
      )}
      <p className="text-secondary text-xs leading-relaxed">{caption}</p>
    </div>
  );
}

function CompetitorRates({ rates }: Readonly<{ rates: SurfaceRates['competitor_mention_rates'] }>) {
  if (rates.length === 0) return null;
  return (
    <section className="grid gap-2 p-4">
      <div className="grid gap-0.5">
        <Label>Competitors, when an overview appeared</Label>
        <p className="text-muted text-xs">
          Over the same denominator as your own conditional mention rate, so the two are comparable.
        </p>
      </div>
      <ul className={ledgerClasses('open')}>
        {rates.map((entry) => (
          <li key={entry.name} className="flex items-center justify-between gap-3 py-2">
            <span className={textRole('body', 'min-w-0 truncate')}>{entry.name}</span>
            <span className="text-secondary shrink-0 text-sm tabular-nums">
              {entry.rate.value === null
                ? 'Unavailable'
                : `${Math.round(entry.rate.value * 1000) / 10}%`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * How many observations could not be used, said out loud.
 *
 * A retrieval CiteLadder never completed says nothing about whether Google
 * showed the brand. It is kept out of every denominator above — and reported
 * here, because silently dropping it would let our own gaps read as a clean
 * measurement.
 */
function ExcludedNote({ data }: Readonly<{ data: SurfaceRates }>) {
  if (data.excluded === 0) return null;
  return (
    <Alert tone="info">
      {`${data.excluded} ${data.excluded === 1 ? 'observation was' : 'observations were'} not retrievable and ${data.excluded === 1 ? 'is' : 'are'} excluded from every rate above. They are not counted as the brand being absent.`}
    </Alert>
  );
}

export function SurfaceRatesPanel({
  query,
}: Readonly<{ query: UseQueryResult<SurfaceRates, unknown> }>) {
  const data = query.data;
  if (query.isError) return <Alert tone="danger">Could not load the AI Overview rates.</Alert>;
  if (!data) return <div className="bg-surface-2 min-h-48 rounded-[var(--radius-card)]" />;
  return (
    <Card aria-busy={query.isFetching}>
      <CardHeader>
        <CardTitle>Google AI Overview</CardTitle>
        <p className={textRole('meta', 'text-secondary')}>
          {`${data.successful} successfully observed ${data.successful === 1 ? 'search' : 'searches'}, ${data.with_overview} of which showed an overview. Each rate below states what it divided by.`}
        </p>
      </CardHeader>
      <CardContent className="grid gap-[var(--workspace-gap)] p-0">
        <div className="border-border-subtle divide-border-subtle grid divide-y border-b sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:[&>*+*]:border-l">
          <RateTile
            label="Overview shown"
            caption="A property of the QUERIES, not of your brand. It moves when Google changes what it answers with."
            rate={data.trigger_rate}
          />
          <RateTile
            label="Named, when shown"
            caption="Conditional. It can rise while overall visibility falls, if Google shows fewer overviews but names you in more of them."
            rate={data.brand_mention_rate_when_present}
          />
          <RateTile
            label="Overall visibility"
            caption="Unconditional, and the closest to 'how visible are we here'. A search with no overview counts against it."
            rate={data.overall_brand_visibility}
          />
          <RateTile
            label="Your site cited"
            caption="Independent of being named: an overview can name you without citing you, and cite you without naming you."
            rate={data.owned_citation_rate_when_present}
          />
        </div>
        <CompetitorRates rates={data.competitor_mention_rates} />
        <div className="px-4 pb-4">
          <ExcludedNote data={data} />
        </div>
      </CardContent>
    </Card>
  );
}

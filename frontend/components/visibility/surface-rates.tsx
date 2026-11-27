import { useId } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

import { BusyRung } from '@/components/ui/rung-meter';
import { Absence } from '@/components/ui/absence';
import { BrandMark } from '@/components/ui/brand-mark';
import { ClampText } from '@/components/ui/clamp-text';
import { Inline } from '@/components/ui/layout';
import { Text } from '@/components/ui/typography';
import { formatPercent } from '@/lib/format';
import type { AioRate, SurfaceRates } from '@citeladder/contracts';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { Section, SectionBleed, SectionHeader, SectionTitle } from '@/components/ui/section';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';

const DENOMINATOR_COPY: Record<string, string> = {
  successful_observations: 'searches we successfully observed',
  observations_with_ai_overview: 'searches where it was shown',
};

function denominatorCopy(rate: AioRate): string {
  const scope = DENOMINATOR_COPY[rate.denominator_kind] ?? 'observations counted';
  return `${rate.numerator} of ${rate.denominator} ${scope}`;
}

function rateStat({
  key,
  label,
  rate,
}: Readonly<{ key: string; label: string; rate: AioRate }>): FigureSegment {
  return {
    key,
    label,
    value: rate.value === null ? null : formatPercent(rate.value),
    missingState: 'unavailable',
    sub: rate.value === null ? undefined : denominatorCopy(rate),
  };
}

function CompetitorRates({ rates }: Readonly<{ rates: SurfaceRates['competitor_mention_rates'] }>) {
  const titleId = useId();
  if (rates.length === 0) return null;
  return (
    <Section aria-labelledby={titleId}>
      <SectionHeader>
        <SectionTitle level={3} id={titleId}>
          Competitors, when an overview appeared
        </SectionTitle>
      </SectionHeader>
      <SectionBleed as="ul" rows>
        {rates.map((entry) => (
          <Inline as="li" key={entry.name} gap="meta" align="baseline" justify="between">
            <ClampText phoneWrap grow text="body">
              <Inline as="span">
                <BrandMark
                  name={entry.name}
                  logoUrl={entry.logo_url}
                  websiteUrl={entry.website_url}
                />
                {entry.name}
              </Inline>
            </ClampText>
            <Inline box="fixed">
              {entry.rate.value === null ? (
                <Absence state="unavailable" body />
              ) : (
                <>
                  <Text variant="body" numeric>
                    {formatPercent(entry.rate.value)}
                  </Text>
                  <Text variant="caption" numeric>
                    {`${entry.rate.numerator} of ${entry.rate.denominator}`}
                  </Text>
                </>
              )}
            </Inline>
          </Inline>
        ))}
      </SectionBleed>
    </Section>
  );
}

export function SurfaceRatesPanel({
  query,
  engineLabel,
}: Readonly<{ query: UseQueryResult<SurfaceRates, unknown>; engineLabel: string }>) {
  const data = query.data;
  if (query.isError)
    return (
      <Notice
        kind="read"
        {...readErrorProps(query)}
        title={`Couldn't load the ${engineLabel} rates`}
        fallback="The request failed or timed out."
      />
    );
  if (!data)
    return (
      <StateBlock
        kind="loading"
        label={`Loading ${engineLabel} rates…`}
        shape={{ kind: 'figures', count: 4 }}
      />
    );
  return (
    <Section aria-busy={query.isFetching}>
      <BusyRung active={query.isFetching} label={`Updating ${engineLabel} rates`} />
      <SectionHeader>
        <SectionTitle>{engineLabel}</SectionTitle>
      </SectionHeader>
      <FigureStrip
        segments={[
          rateStat({ key: 'trigger', label: 'Shown', rate: data.trigger_rate }),
          rateStat({
            key: 'named',
            label: 'Named, when shown',
            rate: data.brand_mention_rate_when_present,
          }),
          rateStat({
            key: 'overall',
            label: 'Overall visibility',
            rate: data.overall_brand_visibility,
          }),
          rateStat({
            key: 'cited',
            label: 'Your site cited',
            rate: data.owned_citation_rate_when_present,
          }),
        ]}
      />
      <CompetitorRates rates={data.competitor_mention_rates} />
    </Section>
  );
}

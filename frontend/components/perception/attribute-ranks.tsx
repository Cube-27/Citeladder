import { useState } from 'react';
import type { PerceptionResponse } from '@citeladder/contracts/visibility-perception';

import { IconButton } from '@/components/ui/button';
import { Section, SectionHeader, SectionTitle, SectionToolbar } from '@/components/ui/section';
import { InfoHint } from '@/components/ui/info-hint';
import { SegmentedControl } from '@/components/ui/tabs';
import { Text } from '@/components/ui/typography';
import { RankBarList } from '@/components/ui/polarity-bars';
import { Maximize2, Minimize2 } from '@/lib/icons';
import { formatCount } from '@/lib/format';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { rankCategories, type Polarity } from '@/lib/visibility/perception';

type Category = PerceptionResponse['entities'][number]['categories'][number];

const SHOWN = 9;

const ORDERS = ['negative', 'positive'] satisfies Polarity[];

const ORDER_CODEC = stringUrlCodec<Polarity>(ORDERS, 'negative');

const ORDER_LABEL: Record<Polarity, string> = {
  negative: 'Most negative',
  positive: 'Most positive',
};

export function AttributeRanks({ categories }: Readonly<{ categories: readonly Category[] }>) {
  const [requested, setOrder] = useUrlState('rank', ORDER_CODEC, { history: 'replace' });
  const [all, setAll] = useState(false);
  const ranks = {
    negative: rankCategories(categories, 'negative'),
    positive: rankCategories(categories, 'positive'),
  };
  const orders = ORDERS.filter((order) => ranks[order].length > 0);
  const order = orders.includes(requested) ? requested : orders[0];
  if (!order) return null;
  const ranked = ranks[order];
  const shown = all ? ranked : ranked.slice(0, SHOWN);
  const most = ranked[0]?.[order] ?? 1;
  return (
    <Section aria-label="Ranked attributes">
      <SectionHeader>
        <SectionTitle>Ranked attributes</SectionTitle>
      </SectionHeader>
      <SectionToolbar>
        <SegmentedControl
          value={order}
          onChange={setOrder}
          ariaLabel="Order attributes"
          options={orders.map((value) => ({ value, label: ORDER_LABEL[value] }))}
        />
        <InfoHint label="About attributes">Labelled points per category</InfoHint>
        <span className="flex-1" />
        <Text variant="caption">Points</Text>
      </SectionToolbar>
      <RankBarList
        polarity={order}
        rows={shown.map((category) => ({
          key: category.category,
          label: category.category,
          value: formatCount(category[order]),
          percent: Math.max((category[order] / most) * 100, 8),
        }))}
      />
      {ranked.length > SHOWN ? (
        <span className="flex justify-center">
          <IconButton
            icon={all ? Minimize2 : Maximize2}
            label={all ? 'Show fewer' : `Show all ${ranked.length}`}
            onClick={() => setAll(!all)}
          />
        </span>
      ) : null}
    </Section>
  );
}

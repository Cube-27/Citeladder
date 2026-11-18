import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { MatrixAxes, MatrixDimension } from '@citeladder/contracts/visibility-matrix';
import { BrandMark } from '@/components/ui/brand-mark';
import { AxisItemLabel } from '@/components/ui/heat-table';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { YouTag } from '@/components/ui/table';
import { useEngineCatalog } from '@/lib/providers/engines';

/** The read failed or is loading: the card's body says so instead of a table. */
export function matrixBodyState(query: UseQueryResult<unknown>, what: string): ReactNode {
  if (query.isError)
    return (
      <Notice
        kind="read"
        {...readErrorProps(query)}
        title={`Couldn't load the ${what}`}
        fallback="Check your connection and try again."
      />
    );
  if (query.isPending) return <StateBlock kind="loading" label={`Loading the ${what}…`} />;
  return null;
}

/** Each axis item's label as text, for headers, CSV and screen readers. */
export function useAxisText() {
  const { label: engineLabel } = useEngineCatalog();
  return (axes: MatrixAxes, dimension: MatrixDimension): string[] => {
    switch (dimension) {
      case 'engine':
        return axes.engine.map((item) => engineLabel(item.logical_engine));
      case 'topic':
        return axes.topic.map((item) => item.name);
      case 'market':
        return axes.market.map((item) => item.label);
      case 'brand':
        return axes.brand.map((item) => item.name);
      default: {
        const _exhaustive: never = dimension;
        return _exhaustive;
      }
    }
  };
}

/** One axis item as drawn: a brand with its mark and "You", a renamed topic marked. */
export function AxisLabel({
  axes,
  dimension,
  index,
  text,
}: Readonly<{ axes: MatrixAxes; dimension: MatrixDimension; index: number; text: string }>) {
  if (dimension === 'brand') {
    const brand = axes.brand[index];
    return (
      <AxisItemLabel
        text={text}
        lead={
          <BrandMark
            name={text}
            logoUrl={brand?.logo_url}
            websiteUrl={brand?.website_url}
            placement="inline"
          />
        }
        trail={brand?.is_brand ? <YouTag /> : null}
      />
    );
  }
  const renamed = dimension === 'topic' ? axes.topic[index]?.renamed_from : null;
  return (
    <AxisItemLabel
      text={text}
      note={
        renamed
          ? {
              label: '· renamed',
              tip: `Renamed from ${renamed}; this run keeps the topic it asked under.`,
            }
          : undefined
      }
    />
  );
}

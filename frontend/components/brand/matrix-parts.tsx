import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { Visibility } from '@citeladder/contracts';
import type { MatrixAxes, MatrixDimension } from '@citeladder/contracts/visibility-matrix';
import { BrandMark } from '@/components/ui/brand-mark';
import { AxisItemLabel } from '@/components/ui/heat-table';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { YouTag } from '@/components/ui/table';
import { useEngineCatalog } from '@/lib/providers/engines';

/** Items an axis shows at most. */
const AXIS_LIMIT = 10;
/** A pending axis the selection cannot count (topics, markets) reserves this many. */
const UNCOUNTED_AXIS = 5;

/**
 * How many items a pending axis will draw, from the selection already on
 * screen, so the skeleton holds the loaded table's height.
 */
export function pendingAxisLength(selected: Visibility, dimension: MatrixDimension): number {
  const known =
    dimension === 'engine'
      ? selected.per_engine.length
      : dimension === 'brand'
        ? selected.rankings.length
        : UNCOUNTED_AXIS;
  return Math.min(AXIS_LIMIT, Math.max(1, known));
}

/** The read failed or is loading: the card's body says so instead of a table. */
export function matrixBodyState(
  query: UseQueryResult<unknown>,
  what: string,
  pending: ReactNode,
): ReactNode {
  if (query.isError)
    return (
      <Notice
        kind="read"
        {...readErrorProps(query)}
        title={`Couldn't load the ${what}`}
        fallback="Check your connection and try again."
      />
    );
  if (query.isPending) return pending;
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

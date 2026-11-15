import type { PerformanceGranularity } from '@/lib/api/performance';
import {
  setUrlParams,
  stringUrlCodec,
  useUrlState,
  type UrlCodec,
} from '@/lib/navigation/url-state';
import {
  COMPARE_OPTIONS,
  DIMENSION_TABS,
  GRANULARITY_OPTIONS,
  INITIAL_GRANULARITY,
  INITIAL_SELECTION,
  METRIC_CARDS,
  RANGE_OPTIONS,
  type PerformanceMetricKey,
  type RangeSelection,
  type SearchConsoleDimension,
} from '@/lib/performance/performance';

/**
 * Everything the reader has CHOSEN on the Performance surface: the range and
 * its comparison, the chart's bucket size, the open breakdown, and which
 * metrics are drawn. All of it lives in the URL like every other view, so a
 * view can be linked and Back returns to the previous one (brand direction 4).
 *
 * One owner for the whole selection, because these move together: Reset
 * returns all of them to the landing state at once.
 */

/** The two metrics the surface lands on. */
const DEFAULT_METRICS: readonly PerformanceMetricKey[] = ['clicks', 'impressions'];
const METRIC_KEYS = METRIC_CARDS.map((card) => card.key);

const rangeCodec = stringUrlCodec(
  RANGE_OPTIONS.map((option) => option.value),
  INITIAL_SELECTION.range,
);
const compareCodec = stringUrlCodec(
  COMPARE_OPTIONS.map((option) => option.value),
  INITIAL_SELECTION.compare,
);
const granularityCodec = stringUrlCodec(
  GRANULARITY_OPTIONS.map((option) => option.value),
  INITIAL_GRANULARITY,
);
const dimensionCodec = stringUrlCodec<SearchConsoleDimension>(
  DIMENSION_TABS.map((tab) => tab.value),
  'query',
);

/** A calendar date the reader picked (`2026-11-14`); anything else is no date. */
const dateCodec: UrlCodec<string> = {
  parse: (raw) => (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''),
  serialize: (value) => value || null,
};

const metricsCodec: UrlCodec<readonly PerformanceMetricKey[]> = {
  parse: (raw) => {
    const keys = METRIC_KEYS.filter((key) => raw?.split(',').includes(key));
    return keys.length > 0 ? keys : DEFAULT_METRICS;
  },
  serialize: (keys) => {
    const ordered = METRIC_KEYS.filter((key) => keys.includes(key));
    const landing = ordered.join(',') === DEFAULT_METRICS.join(',');
    return landing ? null : ordered.join(',');
  },
};

export type PerformanceSelection = {
  selection: RangeSelection;
  setSelection: (selection: RangeSelection) => void;
  granularity: PerformanceGranularity;
  setGranularity: (granularity: PerformanceGranularity) => void;
  /** The open Search Console tab. Bing's panel owns its own tab state. */
  dimension: SearchConsoleDimension;
  setDimension: (dimension: SearchConsoleDimension) => void;
  activeMetrics: ReadonlySet<PerformanceMetricKey>;
  toggleMetric: (key: PerformanceMetricKey) => void;
  reset: () => void;
};

/** The selection's query keys, each written as one history entry. */
function selectionParams(selection: RangeSelection): Record<string, string | null> {
  return {
    range: rangeCodec.serialize(selection.range),
    from: dateCodec.serialize(selection.from),
    to: dateCodec.serialize(selection.to),
    compare: compareCodec.serialize(selection.compare),
    compare_from: dateCodec.serialize(selection.compareFrom),
    compare_to: dateCodec.serialize(selection.compareTo),
  };
}

export function usePerformanceSelection(): PerformanceSelection {
  const [range] = useUrlState('range', rangeCodec);
  const [from] = useUrlState('from', dateCodec);
  const [to] = useUrlState('to', dateCodec);
  const [compare] = useUrlState('compare', compareCodec);
  const [compareFrom] = useUrlState('compare_from', dateCodec);
  const [compareTo] = useUrlState('compare_to', dateCodec);
  const [granularity, setGranularity] = useUrlState('granularity', granularityCodec);
  const [dimension, setDimension] = useUrlState('dimension', dimensionCodec);
  const [metrics, setMetrics] = useUrlState('metrics', metricsCodec);

  const toggleMetric = (key: PerformanceMetricKey) => {
    // The chart must always draw something, so the last selected metric
    // cannot be turned off.
    if (!metrics.includes(key)) setMetrics([...metrics, key]);
    else if (metrics.length > 1) setMetrics(metrics.filter((metric) => metric !== key));
  };

  // Reset returns the surface to its landing state: the newest synced
  // window, daily buckets, no comparison, the first tab, and the two default
  // metrics. It is offered only while a comparison is active.
  const reset = () =>
    setUrlParams({
      ...selectionParams(INITIAL_SELECTION),
      granularity: null,
      dimension: null,
      metrics: null,
    });

  return {
    selection: { range, from, to, compare, compareFrom, compareTo },
    setSelection: (next) => setUrlParams(selectionParams(next)),
    granularity,
    setGranularity,
    dimension,
    setDimension,
    activeMetrics: new Set(metrics),
    toggleMetric,
    reset,
  };
}

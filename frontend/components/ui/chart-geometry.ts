export const SERIES_WEIGHT = {
  you: 2,
  series: 1.5,
  'trend-you': 2.75,
  'trend-series': 1.75,
  faint: 1.25,
} as const;

export const CHART_MARKER = {
  point: 2.5,
  spark: 2.25,
  marker: 3,
  version: 3,
  event: 3,
  active: 4,
  key: 4,
} as const;

export const CHART_OUTLINE = 2;

export const CHART_HALO = 3;

export const CHART_TEXT_SIZE = 12;

export const CHART_RULE_DASH = {
  grid: '3 3',
  'plot-cursor': '3 3',
  cursor: '4 4',
  bridge: '4 4',
  comparison: '4 4',
  connector: '3 4',
  version: '4 3',
  event: '2 3',
} as const;

export const CHART_KEY_GLYPH = { width: 16, height: 10 } as const;

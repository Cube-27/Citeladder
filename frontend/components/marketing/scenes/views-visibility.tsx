import { ChevronLeft, ChevronRight, Info } from 'lucide-react';

import { Favicon } from './product-view-parts';

/** The AI Visibility Trends view, drawn as the product shows it. Synthetic records only. */

/* Visibility per audit run; the last point is the latest run. Rows are in
   the table's order (highest visibility first), with the own brand marked. */
const BRANDS = [
  {
    name: 'Zernovelle',
    own: true,
    series: 1,
    points: [38, 41, 47, 52, 55, 61, 64],
    position: 1,
    share: 31,
    citations: 29,
  },
  {
    name: 'Brelovanta',
    series: 2,
    points: [62, 61, 60, 60, 59, 59, 58],
    position: 2,
    share: 28,
    citations: 22,
  },
  {
    name: 'Flevorynth',
    series: 3,
    points: [33, 36, 38, 39, 42, 41, 42],
    position: 3,
    share: 20,
    citations: 14,
  },
  {
    name: 'Quorivale',
    series: 4,
    points: [30, 29, 27, 28, 26, 27, 27],
    position: 4,
    share: 13,
    citations: 9,
  },
  {
    name: 'Tessmark',
    series: 5,
    points: [14, 15, 17, 16, 18, 17, 18],
    position: 5,
    share: 8,
    citations: 6,
  },
] as const;

const RUN_DATES = ['Jul 8', 'Jul 22', 'Aug 5', 'Aug 19', 'Sep 2', 'Sep 16', 'Sep 30'] as const;

const CHART_W = 520;
const CHART_H = 160;
const chartX = (index: number) => (index * CHART_W) / (RUN_DATES.length - 1);
const chartY = (value: number) => CHART_H - (value / 100) * CHART_H;
/** The point for the latest run: each series holds one point per run date. */
const LATEST_RUN = RUN_DATES.length - 1;
const latest = (brand: (typeof BRANDS)[number]) => brand.points[LATEST_RUN];

const KPIS = [
  ['Visibility', '64%', '+26 pp'],
  ['Share of voice', '31%', '+9 pp'],
  ['Owned citation rate', '29%', '+11 pp'],
] as const;

export function VisibilityView() {
  return (
    <div className="pv-view">
      <div className="pv-stats">
        {KPIS.map(([label, value, delta]) => (
          <div key={label} className="pv-stat">
            <span className="pv-stat-label">
              {label}
              <Info className="size-3" aria-hidden />
            </span>
            <span className="pv-stat-value">
              <strong>{value}</strong>
              <span className="pv-delta" data-direction="up">
                {delta}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="pv-meta">
        Based on 168 of 168 expected answers across 4 engines. Change compares with the run on Jul
        8.
      </p>
      <div className="pv-split pv-split-chart">
        <div className="pv-panel">
          <div className="pv-panel-head pv-panel-head-center">
            <span className="pv-panel-title pv-card-title">Over time</span>
            <span className="pv-button pv-button-quiet">Visibility</span>
          </div>
          <div className="pv-plot">
            <span className="pv-plot-y" aria-hidden>
              <span>100%</span>
              <span>50%</span>
              <span>0%</span>
            </span>
            <svg
              className="pv-chart"
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              preserveAspectRatio="none"
              aria-hidden
            >
              {[0, 50, 100].map((tick) => (
                <line key={tick} x1="0" x2={CHART_W} y1={chartY(tick)} y2={chartY(tick)} />
              ))}
              {BRANDS.map((brand) => (
                <g
                  key={brand.name}
                  data-series={brand.series}
                  data-own={'own' in brand || undefined}
                >
                  <polyline
                    points={brand.points
                      .map((value, i) => `${chartX(i)},${chartY(value)}`)
                      .join(' ')}
                  />
                  <line
                    className="pv-chart-end"
                    x1={CHART_W}
                    x2={CHART_W}
                    y1={chartY(latest(brand))}
                    y2={chartY(latest(brand))}
                  />
                </g>
              ))}
            </svg>
            <span className="pv-plot-x" aria-hidden>
              {RUN_DATES.map((date) => (
                <span key={date}>{date}</span>
              ))}
            </span>
          </div>
          <div className="pv-legend">
            {BRANDS.map((brand) => (
              <span key={brand.name} data-series={brand.series}>
                {'own' in brand ? 'You' : brand.name}
              </span>
            ))}
          </div>
          <p className="sr-only">
            Example trend: Zernovelle rises from 38% to 64% visibility across seven runs while
            Brelovanta slips to 58%.
          </p>
        </div>
        <div className="pv-panel pv-panel-flush">
          <div className="pv-card-head">
            <span className="pv-panel-title pv-card-title">Brand and competitors</span>
            <span className="pv-meta">How often each brand is named, across the same answers.</span>
          </div>
          <table className="pv-table pv-table-brands">
            <thead>
              <tr>
                <th scope="col">Brand</th>
                <th scope="col">Visibility</th>
                <th scope="col">Position</th>
                <th scope="col">Share of voice</th>
                <th scope="col">Citations</th>
              </tr>
            </thead>
            <tbody>
              {BRANDS.map((brand) => (
                <tr key={brand.name} data-own={'own' in brand || undefined}>
                  <td>
                    <span className="pv-domain">
                      <Favicon letter={brand.name[0]} tone={'own' in brand ? 'owned' : 'neutral'} />
                      {brand.name}
                      {'own' in brand && <span className="pv-you">You</span>}
                    </span>
                  </td>
                  <td>{latest(brand)}%</td>
                  <td>#{brand.position}</td>
                  <td>{brand.share}%</td>
                  <td>{brand.citations}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pv-pager">
            <span className="pv-meta">1–5 of 5 brands</span>
            <span className="pv-pager-buttons" aria-hidden>
              <span className="pv-button pv-button-quiet">
                <ChevronLeft className="size-3" />
                Prev
              </span>
              <span className="pv-button pv-button-quiet">
                Next
                <ChevronRight className="size-3" />
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

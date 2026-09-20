import { HERO_COMPETITORS, HERO_SOURCE_MIX, SOURCE_ROWS } from './landing-data';

const chartY = (value: number) => 5 + (75 - value) * 3;
const chartPoints = (history: readonly number[]) =>
  history.map((value, index) => `${32 + index * 67},${chartY(value)}`).join(' ');

/** The hero's compact sample workspace, separate from the full product explorer. */
export function HeroDashboardPreview() {
  return (
    <div className="cl-hero-dashboard">
      <section
        className="cl-hero-dashboard-panel cl-hero-dashboard-trend"
        aria-label="Visibility trend preview"
      >
        <div className="cl-hero-panel-heading">
          <h3>Visibility over time</h3>
          <span>Last 30 days</span>
        </div>
        <div className="cl-hero-trend-legend">
          {HERO_COMPETITORS.map((row, index) => (
            <span key={row.name} className={`cl-hero-series-${index + 1}`}>
              {row.name}
            </span>
          ))}
        </div>
        <div className="cl-hero-trend-chart">
          <svg viewBox="0 0 450 140" preserveAspectRatio="none" aria-hidden="true">
            {(
              [
                ['65%', 35],
                ['50%', 80],
                ['35%', 125],
              ] as const
            ).map(([label, y]) => (
              <g key={label}>
                <text x="0" y={y + 3}>
                  {label}
                </text>
                <line x1="32" x2="434" y1={y} y2={y} />
              </g>
            ))}
            {HERO_COMPETITORS.map((row, index) => (
              <g key={row.name} className={`cl-hero-series-${index + 1}`}>
                <polyline points={chartPoints(row.history)} />
                <circle cx="434" cy={chartY(row.visibility)} r="3" />
              </g>
            ))}
          </svg>
          <span className="sr-only">
            Example visibility trends over the last 30 days:{' '}
            {HERO_COMPETITORS.map((row) => {
              const change = row.visibility - row.history[0];
              const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'unchanged';
              return `${row.name} ${direction} ${Math.abs(change).toFixed(1)} percentage points from ${row.history[0].toFixed(1)}% to ${row.visibility.toFixed(1)}%.`;
            }).join(' ')}
          </span>
        </div>
        <div className="cl-hero-chart-axis">
          <span>30 days ago</span>
          <span>Today</span>
        </div>
      </section>
      <section
        className="cl-hero-dashboard-panel cl-hero-dashboard-brands"
        aria-label="Competitor comparison preview"
      >
        <div className="cl-hero-panel-heading">
          <h3>Competitor comparison</h3>
          <span>Example data</span>
        </div>
        <table>
          <thead>
            <tr>
              <th scope="col">Brand</th>
              <th scope="col">Visibility</th>
              <th scope="col">Position</th>
            </tr>
          </thead>
          <tbody>
            {HERO_COMPETITORS.map((row, index) => (
              <tr key={row.name} className={index === 0 ? 'cl-hero-own-brand' : undefined}>
                <td>
                  <span className={`cl-hero-brand-name cl-hero-series-${index + 1}`}>
                    {row.name}
                  </span>
                </td>
                <td>{row.visibility.toFixed(1)}%</td>
                <td>{row.position.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section
        className="cl-hero-dashboard-panel cl-hero-dashboard-sources"
        aria-label="Cited domains preview"
      >
        <div className="cl-hero-panel-heading">
          <h3>Cited domains</h3>
          <span>Across completed answers</span>
        </div>
        <table>
          <thead>
            <tr>
              <th scope="col">Domain</th>
              <th scope="col">Type</th>
              <th scope="col">Citations</th>
            </tr>
          </thead>
          <tbody>
            {SOURCE_ROWS.map((row) => (
              <tr key={row.domain}>
                <td>{row.domain}</td>
                <td>{row.type}</td>
                <td>{row.citations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section
        className="cl-hero-dashboard-panel cl-hero-dashboard-mix"
        aria-label="Source mix preview"
      >
        <div className="cl-hero-panel-heading">
          <h3>Source mix</h3>
          <span>130 citations</span>
        </div>
        <div className="cl-source-track" aria-hidden="true">
          {HERO_SOURCE_MIX.map((source) => (
            <i key={source.name} style={{ width: `${source.percent}%` }} />
          ))}
        </div>
        <div className="cl-source-legend">
          {HERO_SOURCE_MIX.map((source) => (
            <span key={source.name}>
              {source.name} <span className="sr-only">{source.percent}% of citations</span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

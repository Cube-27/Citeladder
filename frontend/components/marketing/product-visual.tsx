/**
 * ProductVisual — the hero's product frame.
 *
 * Deliberately carries NO data. An earlier version rendered a fictional
 * "Acme Corp" workspace with an invented score, made-up competitors and
 * fabricated prompts; presenting numbers a customer could read as real
 * results misrepresents the product, so the figures are gone rather than
 * restyled.
 *
 * What remains is the app's STRUCTURE in the flat/hairline language: the
 * chrome, the panel rhythm, a chart frame and a table skeleton. Column and
 * row labels are real (they name what the product actually reports); every
 * value position is a neutral placeholder bar. The whole figure is
 * `aria-hidden` — it is decorative, and the surrounding copy carries the
 * meaning.
 */

/** Placeholder bar widths (%), fixed so the figure renders identically every
 *  time — these are layout geometry, not data. */
const BRAND_ROWS = [
  { name: 68, share: 74, rank: 1 },
  { name: 52, share: 58, rank: 2 },
  { name: 60, share: 44, rank: 3 },
  { name: 44, share: 30, rank: 4 },
] as const;

/** Column heights (%) for the chart frame's bars. */
const CHART_BARS = [38, 52, 46, 63, 58, 71, 66, 80] as const;

function Ph({ w, strong = false }: Readonly<{ w: number; strong?: boolean }>) {
  return <span className={strong ? 'ph ph-strong' : 'ph'} style={{ width: `${w}%` }} />;
}

export function ProductVisual() {
  return (
    <section className="viz" id="product" aria-label="Searchify dashboard layout">
      <div className="viz-stage container">
        <div className="dash rim" aria-hidden="true">
          {/* Window chrome — page title + filter chips, no values. */}
          <div className="dash-topbar">
            <span className="ws-chip">
              <span className="ws-avatar" />
              <Ph w={46} strong />
            </span>
            <span className="chip">
              <Ph w={72} />
            </span>
            <span className="spacer" />
            <span className="chip">
              <Ph w={64} />
            </span>
          </div>

          <div className="dash-grid">
            {/* Trend card — an empty axis frame with placeholder columns. */}
            <div className="panel">
              <div className="panel-label">Visibility over time</div>
              <div className="chart-frame">
                {CHART_BARS.map((h, i) => (
                  <span className="chart-bar" key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>

            {/* Competitors card — real column headers, placeholder cells. */}
            <div className="panel">
              <div className="panel-label">Competitors</div>
              <div className="tbl">
                <div className="tbl-head">
                  <span>#</span>
                  <span>Brand</span>
                  <span>Share</span>
                </div>
                {BRAND_ROWS.map((row) => (
                  <div className="tbl-row" key={row.rank}>
                    <span className="tbl-rank">{row.rank}</span>
                    <span className="tbl-brand">
                      <span className={`brand-dot brand-dot-${row.rank}`} />
                      <Ph w={row.name} strong={row.rank === 1} />
                    </span>
                    <span className="tbl-share">
                      <span className="share-track">
                        <span
                          className={row.rank === 1 ? 'share-fill share-fill-you' : 'share-fill'}
                          style={{ width: `${row.share}%` }}
                        />
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Per-model strip — the three engines are named (that is a real
              product fact); the numbers beside them are placeholders. */}
          <div className="engine-tiles">
            {['ChatGPT', 'Gemini', 'Claude'].map((name, i) => (
              <div className="engine-tile" key={name}>
                <span className="engine-name">
                  <span className={`engine-dot dot-${i + 1}`} />
                  {name}
                </span>
                <Ph w={34} strong />
                <div className="engine-bar">
                  <i style={{ width: `${[72, 58, 64][i]}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

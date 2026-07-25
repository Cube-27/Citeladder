import {
  Gauge,
  ListChecks,
  MessagesSquare,
  Package,
  Search,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

/**
 * ProductVisual — the hero figure: the real Searchify home screen.
 *
 * This mirrors the actual `/visibility` Overview surface — the 236px sidebar
 * with its real nav groups and labels, the filter chip row, the summary line,
 * and the Competitors / By-model composition — so what a visitor sees here is
 * what they get after signing in.
 *
 * The readings are an ILLUSTRATIVE example and the frame says so with a
 * visible "Example data" chip. The brands are real and public; the numbers are
 * a plausible worked example for the project-management category, not a
 * customer's results. Showing a labelled example is how you explain a metric;
 * presenting invented numbers as a real outcome would not be.
 */

type Brand = {
  name: string;
  visibility: number;
  share: number;
  delta: number;
  you?: boolean;
};

const BRANDS: readonly Brand[] = [
  { name: 'Asana', visibility: 64, share: 29, delta: 1.8 },
  { name: 'Monday.com', visibility: 58, share: 26, delta: -0.4 },
  { name: 'Notion', visibility: 52, share: 23, delta: 2.6, you: true },
  { name: 'Linear', visibility: 37, share: 14, delta: 0.9 },
  { name: 'Trello', visibility: 21, share: 8, delta: -1.2 },
];

const TREND = [38, 41, 40, 45, 44, 48, 50, 52] as const;
const TREND_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'] as const;

const MODELS = [
  { name: 'ChatGPT', score: 57 },
  { name: 'Gemini', score: 49 },
  { name: 'Claude', score: 51 },
] as const;

/** Mirrors components/layout/nav-items.ts — the real sidebar model. */
const NAV_GROUPS = [
  {
    title: 'Analyze',
    items: [
      { label: 'Visibility', Icon: Gauge, active: true },
      { label: 'Answers', Icon: MessagesSquare },
      { label: 'Traffic', Icon: TrendingUp },
      { label: 'Prompts', Icon: MessagesSquare },
      { label: 'Products', Icon: Package },
      { label: 'Runs', Icon: ListChecks },
    ],
  },
  {
    title: 'Improve',
    items: [{ label: 'Site health', Icon: ShieldCheck }],
  },
] as const;

function Delta({ value }: Readonly<{ value: number }>) {
  const up = value > 0;
  return (
    <span className={up ? 'dv-delta up' : 'dv-delta down'}>
      {up ? '↑' : '↓'} {Math.abs(value).toFixed(1)}
    </span>
  );
}

export function ProductVisual() {
  const max = Math.max(...TREND);

  return (
    <section className="viz" id="product" aria-label="The Searchify dashboard">
      <div className="viz-stage container">
        <div className="app-shot rim">
          {/* ── Sidebar — the real app chrome ─────────────────────────── */}
          <aside className="as-side">
            <div className="as-ws">
              <span className="as-ws-avatar">N</span>
              <span className="as-ws-name">Notion</span>
            </div>
            <div className="as-search">
              <Search aria-hidden />
              <span>Search or jump to…</span>
              <kbd>⌘K</kbd>
            </div>
            {NAV_GROUPS.map((group) => (
              <div className="as-group" key={group.title}>
                <span className="as-group-label">{group.title}</span>
                {group.items.map(({ label, Icon, ...rest }) => (
                  <span
                    className={'active' in rest && rest.active ? 'as-nav is-active' : 'as-nav'}
                    key={label}
                  >
                    <Icon aria-hidden />
                    {label}
                  </span>
                ))}
              </div>
            ))}
          </aside>

          {/* ── Content column ────────────────────────────────────────── */}
          <div className="as-main">
            <div className="as-toolbar">
              <span className="chip">Last 30 days</span>
              <span className="chip">All models</span>
              <span className="spacer" />
              <span className="chip chip-example">Example data</span>
            </div>

            <div className="as-head">
              <h3 className="as-title">Overview</h3>
              <p className="as-summary">
                Notion is mentioned in <b>52%</b> of answers, up 2.6 points this month
              </p>
              <span className="as-metrics">
                <span>
                  Visibility <b>52%</b>
                </span>
                <span>
                  Rank <b>#3</b>
                </span>
              </span>
            </div>

            <div className="as-cards">
              <div className="panel">
                <div className="panel-head">
                  <span className="panel-label">Visibility over time</span>
                  <span className="dv-headline">
                    52% <Delta value={2.6} />
                  </span>
                </div>
                <div className="chart-frame">
                  {TREND.map((v, i) => (
                    <span className="chart-col" key={TREND_MONTHS[i]}>
                      <span className="chart-bar" style={{ height: `${(v / max) * 100}%` }} />
                      <span className="chart-x">{TREND_MONTHS[i]}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <span className="panel-label">Competitors</span>
                </div>
                <div className="tbl">
                  <div className="tbl-head">
                    <span>#</span>
                    <span>Brand</span>
                    <span>Visibility</span>
                    <span>Share</span>
                  </div>
                  {BRANDS.map((brand, i) => (
                    <div className={brand.you ? 'tbl-row is-you' : 'tbl-row'} key={brand.name}>
                      <span className="tbl-rank">{i + 1}</span>
                      <span className="tbl-brand">
                        <span className={`brand-dot brand-dot-${i + 1}`} />
                        {brand.name}
                        {brand.you ? <span className="you-chip">You</span> : null}
                      </span>
                      <span className="tbl-vis">
                        {brand.visibility}%
                        <Delta value={brand.delta} />
                      </span>
                      <span className="tbl-share">
                        <span className="share-track">
                          <span
                            className={brand.you ? 'share-fill share-fill-you' : 'share-fill'}
                            style={{ width: `${(brand.share / 29) * 100}%` }}
                          />
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="engine-tiles">
              {MODELS.map(({ name, score }, i) => (
                <div className="engine-tile" key={name}>
                  <span className="engine-name">
                    <span className={`engine-dot dot-${i + 1}`} />
                    {name}
                  </span>
                  <span className="engine-score">{score}%</span>
                  <div className="engine-bar">
                    <i style={{ width: `${score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

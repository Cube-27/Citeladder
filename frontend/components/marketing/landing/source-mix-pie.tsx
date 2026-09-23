import { HERO_SOURCE_MIX } from './landing-data';

const colors = [
  'var(--color-accent)',
  'var(--cl-source-review)',
  'var(--cl-source-editorial)',
  'var(--cl-source-community)',
  'var(--cl-source-competitor)',
];

let start = 0;
const slices = HERO_SOURCE_MIX.map((source, index) => {
  const end = start + source.percent;
  const slice = `${colors[index]} ${start}% ${end}%`;
  start = end;
  return slice;
});

/** The same fictional source distribution in the hero and Sources preview. */
export function SourceMixPie() {
  return (
    <div className="cl-source-mix">
      <span
        className="cl-source-pie"
        aria-hidden="true"
        style={{ backgroundImage: `conic-gradient(${slices.join(', ')})` }}
      />
      <ul className="cl-source-legend">
        {HERO_SOURCE_MIX.map((source) => (
          <li key={source.name}>
            <span>{source.name}</span>
            <strong>{source.percent}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

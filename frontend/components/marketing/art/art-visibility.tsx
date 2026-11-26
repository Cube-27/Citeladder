import { EngineMark } from '@/components/ui/engine-mark';
import { Eye, Link2, ShoppingBag } from '@/lib/icons';

import { Art, Card, Chips, Line, Pill, Placed } from './art-parts';

export function ArtVisibility() {
  return (
    <Art>
      <Card at={{ top: 8, left: 27, width: 46 }}>
        <div className="cl-art-row">
          <EngineMark engine="chatgpt" />
          <Line width={60} tone="strong" />
        </div>
        <Line width={100} />
        <Line width={100} />
        <Line width={200 / 3} />
      </Card>
      <Placed kind="link" at={{ top: 38, left: 50, height: 10 }} />
      <Pill ring at={{ top: 47, left: 50 }} centre="x">
        <Eye aria-hidden />
        Visibility
      </Pill>
      <Chips count={4} at={{ top: 66, right: -8, left: -8 }}>
        <Pill>ChatGPT</Pill>
      </Chips>
      <Chips count={4} at={{ top: 82, right: 2, left: 2 }} />
    </Art>
  );
}

export function ArtSources() {
  return (
    <Art>
      <Card at={{ top: 9, left: 19, width: 62 }}>
        <div className="cl-art-windowbar">
          <span />
          <span />
          <span />
        </div>
        <div className="cl-art-row">
          <Line width={25} tone="strong" />
          <Line width={60} />
        </div>
        <Line width={100} />
        <Line width={100} />
        <Line width={100} />
        <Line width={80} trail />
      </Card>
      <Pill ring at={{ top: 55, left: 50 }} centre="x">
        <Link2 aria-hidden />
        Cited sources
      </Pill>
      <Card ghost at={{ top: 74, left: 30, width: 40 }}>
        <div className="cl-art-row">
          <span className="cl-art-num">1</span>
          <Line width={60} tone="strong" />
        </div>
        <div className="cl-art-row">
          <span className="cl-art-num">2</span>
          <Line width={40} />
        </div>
      </Card>
    </Art>
  );
}

const BARS = [
  [52, '30%'],
  [24, '13%'],
  [40, '25%'],
  [62, '45%'],
  [84, '56%'],
] as const;

export function ArtReferrals() {
  return (
    <Art>
      <svg
        aria-hidden
        focusable="false"
        viewBox="0 0 300 200"
        preserveAspectRatio="none"
        className="cl-art-area"
      >
        <path d="M0 200V150C40 150 60 95 100 95S150 130 185 110 240 40 300 30V200Z" />
      </svg>
      <Placed kind="bars" at={{ top: 14, bottom: 0, left: 8, width: 56 }}>
        {BARS.map(([height, share], index) => (
          <span
            key={share}
            className="cl-art-bar"
            data-strong={index === BARS.length - 1 || undefined}
            style={{ '--art-height': `${height}%` }}
          >
            <span className="cl-art-tag">{share}</span>
          </span>
        ))}
      </Placed>
      <Card at={{ top: 14, right: -4, width: 34 }}>
        <span className="cl-art-caption">AI sessions</span>
        <span className="cl-art-stat">1,846</span>
        <Line width={80} tone="strong" />
        <Line width={60} />
      </Card>
    </Art>
  );
}

export function ArtCommerce() {
  return (
    <Art>
      <Pill ring at={{ top: 9, left: 50 }} centre="x">
        <ShoppingBag aria-hidden />
        Recommended
      </Pill>
      <Placed kind="link" at={{ top: 21, left: 50, height: 9 }} />
      <Placed kind="shelf" at={{ top: 30, right: -6, left: -6 }}>
        {[false, false, true, false, false].map((picked, index) => (
          <Card key={index} ghost={!picked} picked={picked}>
            <span className="cl-art-swatch" />
            <Line width={80} tone={picked ? 'strong' : 'soft'} />
            <Line width={50} />
          </Card>
        ))}
      </Placed>
    </Art>
  );
}

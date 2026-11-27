import { EngineMark, type EngineKey } from '@/components/ui/engine-mark';
import {
  Bot,
  Check,
  Pencil,
  Plug,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from '@/lib/icons';

import { Art, type ArtPlace, Card, Chips, Line, Pill, Placed } from './art-parts';

export function ArtSiteHealth() {
  return (
    <Art>
      <Card at={{ top: 12, left: 8, width: 34 }} align="center">
        <svg aria-hidden focusable="false" viewBox="0 0 100 100" className="cl-art-gauge">
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            strokeWidth="11"
            className="cl-art-stroke-wash"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray="206 252"
            transform="rotate(-90 50 50)"
            className="cl-art-stroke"
          />
          <text
            x="50"
            y="59"
            textAnchor="middle"
            fontSize="27"
            fontWeight="500"
            className="cl-art-fill-ink"
          >
            82
          </text>
        </svg>
      </Card>
      <Card at={{ top: 22, right: -4, width: 52 }}>
        {[true, true, false, true].map((passed, index) => (
          <div key={index} className="cl-art-row">
            {passed ? (
              <Check aria-hidden className="cl-art-icon" />
            ) : (
              <X aria-hidden className="cl-art-icon" />
            )}
            <Line width={passed ? 60 : 80} tone={passed ? 'soft' : 'strong'} />
          </div>
        ))}
      </Card>
      <Pill ring at={{ top: 72, left: 14 }}>
        <ShieldCheck aria-hidden />
        Site health
      </Pill>
    </Art>
  );
}

export function ArtDemand() {
  return (
    <Art>
      <Card at={{ top: 18, left: 14, height: 64, width: 72 }}>
        <div className="cl-art-row">
          <Line width={25} tone="strong" />
          <Line width={40} />
        </div>
        <svg
          aria-hidden
          focusable="false"
          viewBox="0 0 200 80"
          preserveAspectRatio="none"
          className="min-h-0 w-full flex-1 overflow-visible"
        >
          <path d="M0 80V62L40 56 80 60 120 38 160 30 200 8V80Z" className="cl-art-fill-wash" />
          <path
            d="M0 62L40 56 80 60 120 38 160 30 200 8"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="cl-art-stroke"
          />
        </svg>
      </Card>
      <Pill ring at={{ top: 9, right: 6 }}>
        <TrendingUp aria-hidden />
        Emerging query
      </Pill>
      <Chips count={2} at={{ top: 88, right: 20, left: 20 }} />
    </Art>
  );
}

const VOLUMES = [38, 26, 18, 10] as const;

export function ArtKeywords() {
  return (
    <Art>
      <Pill ring at={{ top: 10, left: 14, width: 72 }}>
        <Search aria-hidden />
        <Line width={50} tone="strong" />
      </Pill>
      <Card at={{ top: 34, left: 20, width: 60 }}>
        {VOLUMES.map((volume, index) => (
          <div key={volume} className="cl-art-row justify-between">
            <Line width={index % 2 === 0 ? 40 : 100 / 3} />
            <Line width={volume} tone="strong" />
          </div>
        ))}
      </Card>
      <Chips count={4} at={{ top: 86, right: -8, left: -8 }} />
    </Art>
  );
}

export function ArtContent() {
  return (
    <Art>
      <Card at={{ top: 9, left: 10, width: 52 }}>
        <Line width={60} tone="strong" />
        <Line width={100} />
        <Line width={100} tone="wash" />
        <Line width={100} />
        <Line width={80} />
        <Line width={100} />
        <Line width={50} />
      </Card>
      <Pill ring at={{ top: 30, right: 5 }}>
        <Pencil aria-hidden />
        Improve page
      </Pill>
      <Card ghost at={{ top: 56, right: -3, width: 46 }}>
        <div className="cl-art-row">
          <Sparkles aria-hidden className="cl-art-icon" />
          <Line width={60} tone="strong" />
        </div>
        <Line width={100} />
        <Line width={200 / 3} />
      </Card>
    </Art>
  );
}

export function ArtAgent() {
  return (
    <Art>
      <Placed kind="bubble" at={{ top: 10, right: 8, width: 46 }}>
        <Line width={100} />
        <Line width={60} />
      </Placed>
      <Card at={{ top: 40, left: 8, width: 62 }}>
        <div className="cl-art-row">
          <Bot aria-hidden className="cl-art-icon" />
          <Line width={40} tone="strong" />
        </div>
        <Line width={100} />
        <Line width={100} />
        <Line width={75} />
      </Card>
      <Pill ring at={{ top: 80, right: 10 }}>
        <Sparkles aria-hidden />
        Draft brief
      </Pill>
    </Art>
  );
}

const CLIENTS: readonly Readonly<{ engine: EngineKey; at: ArtPlace }>[] = [
  { engine: 'claude', at: { top: 10, left: 14 } },
  { engine: 'chatgpt', at: { top: 10, right: 14 } },
  { engine: 'gemini', at: { bottom: 10, left: 14 } },
  { engine: 'google', at: { bottom: 10, right: 14 } },
];

export function ArtMcp() {
  return (
    <Art>
      <svg
        aria-hidden
        focusable="false"
        viewBox="0 0 300 200"
        preserveAspectRatio="none"
        className="cl-art-trace"
      >
        {['M62 42L150 100', 'M238 42L150 100', 'M62 158L150 100', 'M238 158L150 100'].map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            strokeWidth="1.5"
            strokeDasharray="5 5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {CLIENTS.map((client) => (
        <Placed key={client.engine} kind="node" at={client.at}>
          <EngineMark engine={client.engine} />
        </Placed>
      ))}
      <Pill ring at={{ top: 50, left: 50 }} centre="both">
        <Plug aria-hidden />
        CiteLadder MCP
      </Pill>
    </Art>
  );
}

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

import { Art, Card, Chips, Line, Pill } from './art-parts';

export function ArtSiteHealth() {
  return (
    <Art>
      <Card className="absolute top-[12%] left-[8%] w-[34%] items-center">
        <svg aria-hidden focusable="false" viewBox="0 0 100 100" className="w-4/5">
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            strokeWidth="11"
            className="stroke-accent-wash"
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
            className="stroke-accent"
          />
          <text
            x="50"
            y="59"
            textAnchor="middle"
            fontSize="27"
            fontWeight="500"
            className="fill-ink"
          >
            82
          </text>
        </svg>
      </Card>
      <Card className="absolute top-[22%] right-[-4%] w-[52%]">
        {[true, true, false, true].map((passed, index) => (
          <div key={index} className="cl-art-row">
            {passed ? (
              <Check aria-hidden className="cl-art-icon" />
            ) : (
              <X aria-hidden className="cl-art-icon" />
            )}
            <Line className={passed ? 'w-3/5' : 'w-4/5'} tone={passed ? 'soft' : 'strong'} />
          </div>
        ))}
      </Card>
      <Pill ring className="absolute top-[72%] left-[14%]">
        <ShieldCheck aria-hidden />
        Site health
      </Pill>
    </Art>
  );
}

export function ArtDemand() {
  return (
    <Art>
      <Card className="absolute top-[18%] left-[14%] h-[64%] w-[72%]">
        <div className="cl-art-row">
          <Line className="w-1/4" tone="strong" />
          <Line className="w-2/5" />
        </div>
        <svg
          aria-hidden
          focusable="false"
          viewBox="0 0 200 80"
          preserveAspectRatio="none"
          className="min-h-0 w-full flex-1 overflow-visible"
        >
          <path d="M0 80V62L40 56 80 60 120 38 160 30 200 8V80Z" className="fill-accent-wash" />
          <path
            d="M0 62L40 56 80 60 120 38 160 30 200 8"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-accent"
          />
        </svg>
      </Card>
      <Pill ring className="absolute top-[9%] right-[6%]">
        <TrendingUp aria-hidden />
        Emerging query
      </Pill>
      <Chips count={2} className="top-[88%] right-[20%] left-[20%]" />
    </Art>
  );
}

const VOLUMES = ['w-[38%]', 'w-[26%]', 'w-[18%]', 'w-[10%]'] as const;

export function ArtKeywords() {
  return (
    <Art>
      <Pill ring className="absolute top-[10%] left-[14%] w-[72%]">
        <Search aria-hidden />
        <Line className="w-1/2" tone="strong" />
      </Pill>
      <Card className="absolute top-[34%] left-[20%] w-[60%]">
        {VOLUMES.map((volume, index) => (
          <div key={volume} className="cl-art-row justify-between">
            <Line className={index % 2 === 0 ? 'w-2/5' : 'w-1/3'} />
            <Line className={volume} tone="strong" />
          </div>
        ))}
      </Card>
      <Chips count={4} className="top-[86%] right-[-8%] left-[-8%]" />
    </Art>
  );
}

export function ArtContent() {
  return (
    <Art>
      <Card className="absolute top-[9%] left-[10%] w-[52%]">
        <Line className="w-3/5" tone="strong" />
        <Line className="w-full" />
        <Line className="w-full" tone="wash" />
        <Line className="w-full" />
        <Line className="w-4/5" />
        <Line className="w-full" />
        <Line className="w-1/2" />
      </Card>
      <Pill ring className="absolute top-[30%] right-[5%]">
        <Pencil aria-hidden />
        Improve page
      </Pill>
      <Card ghost className="absolute top-[56%] right-[-3%] w-[46%]">
        <div className="cl-art-row">
          <Sparkles aria-hidden className="cl-art-icon" />
          <Line className="w-3/5" tone="strong" />
        </div>
        <Line className="w-full" />
        <Line className="w-2/3" />
      </Card>
    </Art>
  );
}

export function ArtAgent() {
  return (
    <Art>
      <div className="cl-art-bubble absolute top-[10%] right-[8%] w-[46%]">
        <Line className="w-full" />
        <Line className="w-3/5" />
      </div>
      <Card className="absolute top-[40%] left-[8%] w-[62%]">
        <div className="cl-art-row">
          <Bot aria-hidden className="cl-art-icon" />
          <Line className="w-2/5" tone="strong" />
        </div>
        <Line className="w-full" />
        <Line className="w-full" />
        <Line className="w-3/4" />
      </Card>
      <Pill ring className="absolute top-[80%] right-[10%]">
        <Sparkles aria-hidden />
        Draft brief
      </Pill>
    </Art>
  );
}

const CLIENTS: readonly Readonly<{ engine: EngineKey; place: string }>[] = [
  { engine: 'claude', place: 'top-[10%] left-[14%]' },
  { engine: 'chatgpt', place: 'top-[10%] right-[14%]' },
  { engine: 'gemini', place: 'bottom-[10%] left-[14%]' },
  { engine: 'google', place: 'bottom-[10%] right-[14%]' },
];

export function ArtMcp() {
  return (
    <Art>
      <svg
        aria-hidden
        focusable="false"
        viewBox="0 0 300 200"
        preserveAspectRatio="none"
        className="stroke-accent absolute inset-0 size-full opacity-60"
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
        <span key={client.engine} className={`cl-art-node absolute ${client.place}`}>
          <EngineMark engine={client.engine} />
        </span>
      ))}
      <Pill ring className="absolute top-1/2 left-1/2 -translate-1/2">
        <Plug aria-hidden />
        CiteLadder MCP
      </Pill>
    </Art>
  );
}

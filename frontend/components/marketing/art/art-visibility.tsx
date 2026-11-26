import { EngineMark } from '@/components/ui/engine-mark';
import { Eye, Link2, ShoppingBag } from '@/lib/icons';
import { cn } from '@/lib/utils';

import { Art, Card, Chips, Line, Pill } from './art-parts';

export function ArtVisibility() {
  return (
    <Art>
      <Card className="absolute top-[8%] left-[27%] w-[46%]">
        <div className="cl-art-row">
          <EngineMark engine="chatgpt" className="cl-art-icon" />
          <Line className="w-3/5" tone="strong" />
        </div>
        <Line className="w-full" />
        <Line className="w-full" />
        <Line className="w-2/3" />
      </Card>
      <span className="cl-art-link absolute top-[38%] left-1/2 h-[10%]" />
      <Pill ring className="absolute top-[47%] left-1/2 -translate-x-1/2">
        <Eye aria-hidden />
        Visibility
      </Pill>
      <Chips count={4} className="top-[66%] right-[-8%] left-[-8%]">
        <Pill>ChatGPT</Pill>
      </Chips>
      <Chips count={4} className="top-[82%] right-[2%] left-[2%]" />
    </Art>
  );
}

export function ArtSources() {
  return (
    <Art>
      <Card className="absolute top-[9%] left-[19%] w-[62%]">
        <div className="cl-art-windowbar">
          <span />
          <span />
          <span />
        </div>
        <div className="cl-art-row">
          <Line className="w-1/4" tone="strong" />
          <Line className="w-3/5" />
        </div>
        <Line className="w-full" />
        <Line className="w-full" />
        <Line className="w-full" />
        <Line className="mb-[1em] w-4/5" />
      </Card>
      <Pill ring className="absolute top-[55%] left-1/2 -translate-x-1/2">
        <Link2 aria-hidden />
        Cited sources
      </Pill>
      <Card ghost className="absolute top-[74%] left-[30%] w-[40%]">
        <div className="cl-art-row">
          <span className="cl-art-num">1</span>
          <Line className="w-3/5" tone="strong" />
        </div>
        <div className="cl-art-row">
          <span className="cl-art-num">2</span>
          <Line className="w-2/5" />
        </div>
      </Card>
    </Art>
  );
}

const BARS = [
  ['h-[52%]', '30%'],
  ['h-[24%]', '13%'],
  ['h-[40%]', '25%'],
  ['h-[62%]', '45%'],
  ['h-[84%]', '56%'],
] as const;

export function ArtReferrals() {
  return (
    <Art>
      <svg
        aria-hidden
        focusable="false"
        viewBox="0 0 300 200"
        preserveAspectRatio="none"
        className="fill-panel absolute inset-0 size-full opacity-55"
      >
        <path d="M0 200V150C40 150 60 95 100 95S150 130 185 110 240 40 300 30V200Z" />
      </svg>
      <div className="absolute top-[14%] bottom-0 left-[8%] flex w-[56%] items-end gap-[1.6em]">
        {BARS.map(([height, share], index) => (
          <span
            key={share}
            className={cn('cl-art-bar', height, index === BARS.length - 1 && 'cl-art-bar--strong')}
          >
            <span className="cl-art-tag">{share}</span>
          </span>
        ))}
      </div>
      <Card className="absolute top-[14%] right-[-4%] w-[34%]">
        <span className="cl-art-caption">AI sessions</span>
        <span className="cl-art-stat">1,846</span>
        <Line className="w-4/5" tone="strong" />
        <Line className="w-3/5" />
      </Card>
    </Art>
  );
}

export function ArtCommerce() {
  return (
    <Art>
      <Pill ring className="absolute top-[9%] left-1/2 -translate-x-1/2">
        <ShoppingBag aria-hidden />
        Recommended
      </Pill>
      <span className="cl-art-link absolute top-[21%] left-1/2 h-[9%]" />
      <div className="absolute top-[30%] right-[-6%] left-[-6%] flex items-start gap-[1.2em]">
        {[false, false, true, false, false].map((picked, index) => (
          <Card
            key={index}
            ghost={!picked}
            className={cn('flex-1', picked ? 'scale-110' : 'mt-[1.4em]')}
          >
            <span className="cl-art-swatch" />
            <Line className="w-4/5" tone={picked ? 'strong' : 'soft'} />
            <Line className="w-1/2" />
          </Card>
        ))}
      </div>
    </Art>
  );
}

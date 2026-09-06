import { Download, FileSpreadsheet } from 'lucide-react';
import Image from 'next/image';

import type { SolutionScene } from '@/lib/marketing-content/solutions';
import { cn } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { LogoMark } from '@/components/ui/logo-mark';

import { WallpaperPanel } from './wallpaper-panel';

/**
 * Product windows, one per audience segment — the same instrument the landing
 * canvas shows, cut per team. Each panel is a faithful product surface (rows,
 * bars, chips, tabular numerals) with an app-chrome bar, never an invented
 * customer result: every body is hidden from assistive technology.
 *
 * Hue lives in the SURFACES — wallpaper, wells, marker bars, rival bars — the
 * way the reference system tints its product planes; the words themselves stay
 * in ink.
 */
type Tint = 'blue' | 'indigo' | 'purple' | 'green';

const PLATFORM_LOGOS: Record<string, string> = {
  ChatGPT: '/brand/chatgpt.webp',
  Claude: '/brand/claude.webp',
  Perplexity: '/brand/perplexity.webp',
  Gemini: '/brand/gemini.webp',
};

const TINT_CLASSES: Record<Tint, string> = {
  blue: 'bg-tile-blue',
  indigo: 'bg-tile-indigo',
  purple: 'bg-tile-purple',
  green: 'bg-tile-green',
};

/** Tinted wells and chips inside the window — the section's hue at low strength. */
const TINT_WASH: Record<Tint, string> = {
  blue: 'bg-tile-blue/50',
  indigo: 'bg-tile-indigo/50',
  purple: 'bg-tile-purple/50',
  green: 'bg-tile-green/50',
};

/** The small hue marker bar above a window head (the reference's 24×3 marker). */
const TINT_MARK: Record<Tint, string> = {
  blue: 'bg-tile-blue-ink',
  indigo: 'bg-tile-indigo-ink',
  purple: 'bg-tile-purple-ink',
  green: 'bg-tile-green-ink',
};

/** Rival bars carry the section's hue; only the leading brand bar is accent. */
const TINT_RIVAL: Record<Tint, string> = {
  blue: 'bg-tile-blue-ink/30',
  indigo: 'bg-tile-indigo-ink/30',
  purple: 'bg-tile-purple-ink/30',
  green: 'bg-tile-green-ink/30',
};

function PlatformChip({ name }: Readonly<{ name: string }>) {
  return (
    <span className="text-muted inline-flex items-center gap-1.5 text-xs font-medium">
      {PLATFORM_LOGOS[name] ? (
        <Image
          src={PLATFORM_LOGOS[name]}
          alt=""
          width={14}
          height={14}
          className="size-3.5 shrink-0 object-contain"
        />
      ) : null}
      {name}
    </span>
  );
}

function StateChip({ cited }: Readonly<{ cited: boolean }>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        cited ? 'text-accent-text' : 'text-muted',
      )}
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', cited ? 'bg-accent' : 'border-muted border-[1.5px]')}
      />
      {cited ? 'Cited' : 'Not cited'}
    </span>
  );
}

function Bar({
  width,
  own = false,
  tint,
  className,
}: Readonly<{ width: number; own?: boolean; tint?: Tint; className?: string }>) {
  return (
    <span className={cn('bg-background-alt block h-2 overflow-hidden rounded-full', className)}>
      {/* Scaled rather than sized: animating `width` relayouts the row on every
          frame, while `transform` stays on the compositor. */}
      <span
        style={{ transform: `scaleX(${width / 100})` }}
        className={cn(
          'block h-full w-full origin-left rounded-full transition-transform duration-300',
          own ? 'bg-accent' : tint ? TINT_RIVAL[tint] : 'bg-border',
        )}
      />
    </span>
  );
}

/** The shared window chrome: product lockup, surface name, illustrative marker. */
function WindowChrome({ label, tint }: Readonly<{ label: string; tint: Tint }>) {
  return (
    <div className="border-border-subtle flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-1.5">
      <LogoMark size={16} wordmark={false} />
      <span className="text-foreground text-xs font-medium">{label}</span>
      <span
        className={cn(
          'text-muted ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium',
          TINT_WASH[tint],
        )}
      >
        Illustrative
      </span>
    </div>
  );
}

function WindowHead({ title, note, tint }: Readonly<{ title: string; note: string; tint: Tint }>) {
  return (
    <div>
      <span aria-hidden className={cn('mb-2.5 block h-[3px] w-6 rounded-full', TINT_MARK[tint])} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="website-small-heading text-foreground">{title}</h3>
        <span className="text-muted text-xs">{note}</span>
      </div>
    </div>
  );
}

function ExportRow({ tint, badge }: Readonly<{ tint: Tint; badge: string }>) {
  return (
    <div className="border-border-subtle mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <div className="flex flex-wrap gap-2.5">
        <span
          className={cn(
            'text-muted inline-flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-medium',
            TINT_WASH[tint],
          )}
        >
          <Download aria-hidden className="size-3.5" />
          Mentions (CSV)
        </span>
        <span
          className={cn(
            'text-muted inline-flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-medium',
            TINT_WASH[tint],
          )}
        >
          <FileSpreadsheet aria-hidden className="size-3.5" />
          Evidence (Markdown)
        </span>
      </div>
      <Badge variant="status" value="info">
        {badge}
      </Badge>
    </div>
  );
}

const PANEL_LABELS: Record<SolutionScene, string> = {
  share: 'Client report — share of answers',
  health: 'Site health — Web Fundamentals & AEO',
  sample: 'First audit — seeded and capped',
  commerce: 'Ecommerce — product AI visibility',
  citations: 'Citation ownership — per prompt',
};

const PANELS: Record<SolutionScene, (tint: Tint) => React.ReactNode> = {
  share: (tint) => (
    <>
      <WindowHead
        title="Share of citations"
        note="412 recorded answers · four platforms"
        tint={tint}
      />
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
        <span className="bg-accent w-[68%]" />
        <span className={cn('w-[22%]', TINT_RIVAL[tint])} />
        <span className="bg-active w-[10%]" />
      </div>
      <div className="text-muted mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="bg-accent size-1.5 rounded-full" />
          Your brand 68%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn('size-1.5 rounded-full', TINT_MARK[tint])} />
          Competitors 22%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="bg-active size-1.5 rounded-full" />
          No brand 10%
        </span>
      </div>

      <div className="border-border-subtle mt-5 grid gap-3 border-t pt-4">
        {[
          {
            q: 'Best project management tools for startups?',
            s: '“Notion, Linear, and ClickUp are top picks…”',
            p: 'ChatGPT',
            c: '5',
            cited: true,
          },
          {
            q: 'How does Stripe compare to Adyen?',
            s: '“Stripe is easier to integrate and… ”',
            p: 'Claude',
            c: '4',
            cited: false,
          },
          {
            q: 'What is revenue intelligence?',
            s: '“Revenue intelligence is a way to…”',
            p: 'Perplexity',
            c: '6',
            cited: true,
          },
          {
            q: 'Top enterprise AI search platforms?',
            s: '“Leading platforms include…”',
            p: 'Gemini',
            c: '3',
            cited: true,
          },
        ].map(({ q, s, p, c, cited }) => (
          <div
            key={q}
            className="border-border-subtle flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-3 last:border-b-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-foreground truncate text-sm font-medium">{q}</p>
              <p className="text-muted truncate text-xs">{s}</p>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <PlatformChip name={p} />
              <span className="text-foreground w-4 text-right text-sm font-medium tabular-nums">
                {c}
              </span>
              <StateChip cited={cited} />
            </div>
          </div>
        ))}
      </div>
      <ExportRow badge="4 Engines Audited" tint={tint} />
    </>
  ),
  health: (tint) => (
    <>
      <WindowHead title="Site health" note="33 rules · weighted 50/50 Tech & AEO" tint={tint} />
      <div className="mt-4 grid gap-5">
        {[
          { name: 'Web Fundamentals', value: 88, status: 'Optimal', delta: '+2 vs last run' },
          { name: 'AEO Readiness', value: 74, status: 'Good', delta: '+6 vs last run' },
          { name: 'Schema Validation', value: 92, status: 'Validated', delta: 'No change' },
        ].map(({ name, value, status, delta }) => (
          <div key={name} className="grid gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-foreground text-sm font-medium">{name}</span>
              <div className="flex items-baseline gap-2.5">
                <span className="text-muted text-xs">{delta}</span>
                <span className="text-foreground text-xl font-medium tabular-nums">
                  {value}
                  <span className="text-muted text-xs">/100</span>
                </span>
              </div>
            </div>
            <Bar width={value} own={value >= 80} tint={tint} />
            <span className="text-muted text-xs">{status}</span>
          </div>
        ))}
      </div>
      <div className="border-border-subtle mt-5 flex flex-wrap gap-2.5 border-t pt-4">
        <Badge variant="status" value="success">
          Search Console Synced
        </Badge>
        <Badge variant="status" value="success">
          GA4 Connected
        </Badge>
        <Badge>Next run Thursday</Badge>
      </div>
    </>
  ),
  sample: (tint) => (
    <>
      <WindowHead title="Sample crawl" note="Your API keys · at cost" tint={tint} />
      <div className="mt-3">
        <Bar width={100} own className="h-1.5" />
      </div>
      <div className="mt-4 grid gap-3">
        {[
          { label: 'Pages sampled', val: '25 / 25 seeded URLs', state: 'Complete', done: true },
          { label: 'Prompts tested', val: '50 target queries', state: 'Complete', done: true },
          { label: 'Positive mention rate', val: '78%', state: 'Computed', done: true },
          {
            label: 'BYOK provider cost',
            val: '$0.14 total API cost',
            state: 'At cost',
            done: false,
          },
        ].map(({ label, val, state, done }) => (
          <div
            key={label}
            className="border-border-subtle flex items-center justify-between gap-3 border-b pb-3 text-sm last:border-b-0 last:pb-0"
          >
            <span className="text-muted">{label}</span>
            <div className="flex items-center gap-3">
              <span className="text-foreground font-mono text-sm font-medium">{val}</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium',
                  done ? TINT_WASH[tint] : 'bg-background-alt text-muted',
                )}
              >
                {state}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="border-border-subtle mt-5 flex flex-wrap gap-2.5 border-t pt-4">
        <Badge variant="status" value="info">
          Raw Run Persisted
        </Badge>
        <Badge>Zero Lock-In</Badge>
      </div>
    </>
  ),
  commerce: (tint) => (
    <>
      <WindowHead
        title="Product visibility"
        note="AI shopping answers · last 30 days"
        tint={tint}
      />
      <div className="mt-4 grid gap-4">
        {[
          {
            name: 'Acoustic Pro ANC Headphones',
            price: '$299.00',
            share: 68,
            rank: '#1 Recommended',
            cited: true,
          },
          {
            name: 'Sony WH-1000XM5',
            price: '$349.00',
            share: 41,
            rank: '#2 Recommended',
            cited: false,
          },
          {
            name: 'Bose QC Ultra Headphones',
            price: '$379.00',
            share: 22,
            rank: '#5 Not cited',
            cited: false,
          },
        ].map(({ name, price, share, rank, cited }) => (
          <div key={name} className="grid gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-foreground text-sm font-medium">{name}</span>
              <div className="flex items-baseline gap-3">
                <span className="text-foreground font-mono text-xs font-medium">{price}</span>
                <StateChip cited={cited} />
              </div>
            </div>
            <Bar width={share} own={rank.startsWith('#1')} tint={tint} />
            <span className="text-muted text-xs font-medium">{rank}</span>
          </div>
        ))}
      </div>
      <div className="border-border-subtle mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border-t pt-4">
        <span className="text-muted text-xs">Competitor co-placement: Sony WH-1000XM5</span>
        <Badge variant="status" value="success">
          64% SKU Share of Voice
        </Badge>
      </div>
    </>
  ),
  citations: (tint) => (
    <>
      <WindowHead title="Citation ownership" note="Query fanout tracked" tint={tint} />
      <div
        className={cn(
          'border-border-subtle text-foreground mt-3 rounded-[var(--radius-control)] border px-3.5 py-2.5 text-sm font-medium',
          TINT_WASH[tint],
        )}
      >
        &ldquo;What are the top enterprise AI search platforms?&rdquo;
      </div>
      <div className="mt-4 grid gap-4">
        {[
          {
            label: 'Owned domain (press release)',
            share: 58,
            engines: 'Cited 4/5 engines',
            own: true,
          },
          {
            label: 'TechCrunch (earned media)',
            share: 34,
            engines: 'Cited 3/5 engines',
            own: false,
          },
          { label: 'Competitor domain', share: 18, engines: 'Cited 1/5 engines', own: false },
        ].map(({ label, share, engines, own }) => (
          <div key={label} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn('text-sm', own ? 'text-foreground font-medium' : 'text-muted')}>
                {label}
              </span>
              <span className="text-muted font-mono text-xs">{engines}</span>
            </div>
            <Bar width={share} own={own} tint={tint} />
          </div>
        ))}
      </div>
      <div className="border-border-subtle mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <span className="text-muted text-xs">Press release earned 58% of this prompt</span>
        <Badge variant="status" value="info">
          Coverage Report Ready
        </Badge>
      </div>
    </>
  ),
};

export function SolutionEvidencePanel({
  scene,
  tint,
  className,
}: Readonly<{
  scene: SolutionScene;
  tint: Tint;
  className?: string;
}>) {
  return (
    <WallpaperPanel className={cn('p-3 sm:p-5', TINT_CLASSES[tint], className)}>
      <div className="bg-panel border-border-subtle overflow-hidden rounded-[var(--radius-card)] border shadow-[0_2px_8px_rgb(12_16_36/0.06),0_24px_56px_-24px_rgb(12_16_36/0.18)]">
        <WindowChrome label={PANEL_LABELS[scene]} tint={tint} />
        {/* The illustrative rows stay hidden from assistive technology so they
            are never announced as persisted customer evidence. */}
        <div aria-hidden className="px-4 py-5 sm:px-5">
          {PANELS[scene](tint)}
        </div>
      </div>
    </WallpaperPanel>
  );
}

import { ArrowRight } from 'lucide-react';
import Image from 'next/image';

import { LogoMark } from '@/components/ui/logo-mark';
import { LANDING_CONTENT } from '@/lib/marketing-content/landing';
import { cn } from '@/lib/utils';

import { TextLink } from '../primitives/button';
import { Eyebrow } from '../primitives/label';
import { Reveal } from '../primitives/reveal';
import { Section } from '../primitives/section';
import { ShareBar } from './share-bar';

/**
 * The scroll-driving beat: the product itself.
 *
 * An editorial workspace canvas in the Direction A mold — one share-of-
 * citations bar (not a KPI card row) above a recorded-answers ledger. The bar
 * and the ledger are illustrations, so both render aria-hidden and the app bar
 * carries the illustrative-workspace marker; the header aside states what the
 * workspace is.
 */
const PLATFORM_LOGOS: Record<string, string> = {
  ChatGPT: '/brand/chatgpt.webp',
  Claude: '/brand/claude.webp',
  Perplexity: '/brand/perplexity.webp',
  Gemini: '/brand/gemini.webp',
};

export function SeeIt() {
  const { seeIt } = LANDING_CONTENT;
  const { canvas } = seeIt;
  return (
    <Section id="see-it" tone="paper" rhythm="base" aria-labelledby="see-it-title">
      <div className="grid gap-x-16 gap-y-6 lg:grid-cols-2">
        <Reveal>
          <Eyebrow>{seeIt.kicker}</Eyebrow>
          <h2
            id="see-it-title"
            className="website-section-heading text-foreground mt-3 max-w-[16ch] text-balance"
          >
            {seeIt.title}
          </h2>
        </Reveal>
        <Reveal className="lg:self-end">
          <p className="website-body text-muted max-w-[50ch]">{seeIt.aside}</p>
          <TextLink href="/#how-it-works" className="mt-4">
            {seeIt.link}
            <ArrowRight className="size-4" aria-hidden />
          </TextLink>
        </Reveal>
      </div>

      <Reveal>
        {/* The ambient ground blooms in one hue — low-alpha radial washes over
            a tint→white→tint gradient — and the white pane floats on it. One
            hue, tokens only, never an action colour. */}
        <div
          aria-hidden
          className="rounded-[var(--radius-overlay)] p-2 sm:p-4"
          style={{
            background:
              'radial-gradient(120% 90% at 88% 0%, var(--color-info-border) 0%, transparent 60%), radial-gradient(90% 80% at 0% 100%, var(--color-cyan-100) 0%, transparent 55%), linear-gradient(135deg, var(--color-info-bg), var(--color-panel) 55%, var(--color-info-bg))',
          }}
        >
          <div
            data-testid="product-canvas"
            className="border-border-subtle bg-panel app-type-scale relative overflow-hidden rounded-[var(--radius-card)] border shadow-[0_12px_32px_-8px_rgb(22_22_26/0.16)]"
          >
            {/* On phones the bar wraps so the tab strip gets a full second row
              instead of slivering between the lockup and the marker. */}
            <div className="border-border-subtle flex min-h-13 flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 sm:h-13 sm:flex-nowrap sm:gap-y-0 sm:px-5 sm:py-0">
              <LogoMark size={22} />
              <div className="order-last flex h-full min-w-0 basis-full scrollbar-none items-stretch gap-5 overflow-x-auto sm:order-none sm:flex-1 sm:basis-auto">
                {canvas.tabs.map((tab) => (
                  <span
                    key={tab}
                    className={cn(
                      'flex items-center border-b-2 text-xs whitespace-nowrap',
                      tab === canvas.activeTab
                        ? 'border-foreground text-foreground font-medium'
                        : 'border-transparent text-muted',
                    )}
                  >
                    {tab}
                  </span>
                ))}
              </div>
              <span className="text-muted border-border-subtle bg-background-alt ml-auto shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium sm:ml-0">
                {canvas.marker}
              </span>
              <span className="text-muted hidden shrink-0 text-xs lg:block">{canvas.range}</span>
            </div>

            <div className="px-4 py-6 sm:px-6 sm:py-7">
              {/* Metrics as one editorial bar — no KPI card row. */}
              <div aria-hidden>
                <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
                  <h3 className="website-small-heading text-foreground">{canvas.share.label}</h3>
                  <span className="text-muted text-xs">{canvas.share.note}</span>
                </div>
                <ShareBar segments={canvas.share.segments} />
              </div>

              {/* The recorded-answers ledger. The grid is the concept's five
                columns; below its floor the whole sheet scrolls sideways in
                its own region rather than reflowing. */}
              <div aria-hidden className="mt-6">
                <div className="scrollbar-none overflow-x-auto">
                  <div className="min-w-[704px]">
                    <div className="text-muted grid grid-cols-[minmax(280px,2.4fr)_minmax(90px,0.9fr)_90px_minmax(96px,1fr)_76px] items-center gap-x-[18px] pb-3 text-[11px] font-medium tracking-[0.12em] uppercase">
                      {canvas.columns.map((column, index) => (
                        <span
                          key={column}
                          className={
                            index === canvas.columns.length - 1 ? 'justify-self-end' : undefined
                          }
                        >
                          {column}
                        </span>
                      ))}
                    </div>
                    {canvas.rows.map((row) => (
                      <div
                        key={row.question}
                        className="border-border-subtle grid grid-cols-[minmax(280px,2.4fr)_minmax(90px,0.9fr)_90px_minmax(96px,1fr)_76px] items-center gap-x-[18px] border-t py-4"
                      >
                        <span className="min-w-0">
                          <span className="text-foreground block text-sm leading-snug font-medium">
                            {row.question}
                          </span>
                          <span className="text-muted mt-1 block truncate text-xs">
                            {row.snippet}
                          </span>
                        </span>
                        <span className="text-secondary flex items-center gap-2 text-sm font-medium">
                          {PLATFORM_LOGOS[row.platform] ? (
                            <Image
                              src={PLATFORM_LOGOS[row.platform]}
                              alt=""
                              width={16}
                              height={16}
                              className="size-4 shrink-0 object-contain"
                            />
                          ) : null}
                          {row.platform}
                        </span>
                        <span className="text-foreground text-sm font-medium tabular-nums">
                          {row.citations}
                        </span>
                        <span className="text-secondary flex items-center gap-2 text-sm font-medium">
                          <i
                            aria-hidden
                            className={
                              row.state === 'cited'
                                ? 'bg-accent size-2 rounded-full'
                                : 'border-muted size-2 rounded-full border-[1.5px]'
                            }
                          />
                          {row.state === 'cited' ? 'Cited' : 'Not cited'}
                        </span>
                        <span className="text-foreground border-border-strong justify-self-end border-b pb-0.5 text-sm font-medium">
                          View →
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* The pane runs past the bottom of the frame — a window onto a
              screen that continues rather than a composition that fits. */}
            <div
              aria-hidden
              className="from-panel via-panel/70 pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t to-transparent"
            />
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

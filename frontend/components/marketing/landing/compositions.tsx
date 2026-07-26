import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { Meta } from '../primitives/label';
import { Section } from '../primitives/section';
import { Reveal } from '../primitives/reveal';
import { WallpaperPanel } from '../scenes/wallpaper-panel';

/**
 * Two feature scenes and the principle that sits behind both. Paper scene,
 * wallpaper scene, quote — the alternation is what keeps a long page from
 * flattening into a card grid.
 */
export function Compositions() {
  const { query, strategy, quote } = LANDING_CONTENT.compositions;

  return (
    <Section rhythm="loose" divided>
      <Reveal className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="border-mkt-line rounded-mkt-xl bg-mkt-surface flex flex-col border p-8 md:p-9">
          <Meta as="p">{query.tag}</Meta>
          <h3 className="font-mkt-display text-mkt-d3 text-mkt-ink mt-14 mb-4 max-w-[14ch] font-medium">
            {query.title}
          </h3>
          <p className="text-mkt-sm text-mkt-ink-soft max-w-[46ch]">{query.body}</p>

          {/* A fanned stack of real buyer questions — the input side of the
              product, shown rather than described. Laid out in flow rather
              than absolutely: the absolute version escaped the card and cut
              its own text off at the right edge. */}
          <div aria-hidden className="mt-auto pt-10 pl-[8%] sm:pl-[22%]">
            {query.cards.map((card, index) => (
              <div
                key={card}
                style={{ rotate: `${[-1, 1.2, -0.5][index]}deg` }}
                className="border-mkt-line bg-mkt-paper-raised shadow-mkt-raised rounded-mkt-sm text-mkt-ink-soft text-mkt-sm -mt-1 truncate border px-4 py-3.5 first:mt-0 [&:nth-child(2)]:opacity-70 [&:nth-child(3)]:opacity-45"
              >
                “{card}”
              </div>
            ))}
          </div>
        </article>

        <article className="border-mkt-line rounded-mkt-xl bg-mkt-surface-sunk flex flex-col justify-between gap-10 border p-8 md:p-9">
          <blockquote className="font-mkt-display text-mkt-ink text-[1.75rem] leading-[1.16] font-medium tracking-[-0.04em]">
            “{quote.text}”
          </blockquote>
          <footer className="flex items-end justify-between gap-4">
            <span className="text-mkt-sm text-mkt-ink-muted">
              <strong className="text-mkt-ink block font-semibold">{quote.attribution}</strong>
              {quote.detail}
            </span>
            <Meta>{quote.mark}</Meta>
          </footer>
        </article>

        <WallpaperPanel className="p-4 sm:p-8 lg:col-span-2 lg:p-10">
          <div className="border-mkt-glass-line bg-mkt-glass rounded-mkt-md max-w-[52ch] border p-8 backdrop-blur-lg md:p-9">
            <Meta as="p" className="text-mkt-slate-soft">
              {strategy.tag}
            </Meta>
            <h3 className="font-mkt-display text-mkt-d3 text-mkt-ink mt-4 mb-4 font-medium">
              {strategy.title}
            </h3>
            <p className="text-mkt-sm text-mkt-slate">{strategy.body}</p>
          </div>
        </WallpaperPanel>
      </Reveal>
    </Section>
  );
}

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { Eyebrow } from '../primitives/label';
import { Reveal } from '../primitives/reveal';
import { Section } from '../primitives/section';
import { LANDING_ICONS } from './landing-icons';

/**
 * Enterprise trust — an asymmetric split between the promise and one concise
 * proof ledger. Each guarantee appears once, with its supporting detail.
 */
export function Trust() {
  const { trust } = LANDING_CONTENT;
  return (
    <Section id="trust" tone="sunken" rhythm="base" aria-labelledby="trust-title">
      <div className="grid items-center gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Reveal className="lg:py-8">
          <Eyebrow>{trust.kicker}</Eyebrow>
          <h2
            id="trust-title"
            className="website-section-heading text-foreground mt-6 max-w-[20ch] text-balance"
          >
            {trust.title}
          </h2>
          <p className="website-body text-muted mt-4 max-w-[52ch]">{trust.who}</p>
        </Reveal>

        <Reveal className="bg-panel overflow-hidden rounded-[var(--radius-card)]">
          <dl className="divide-border divide-y">
            {trust.guarantees.map((guarantee) => {
              const Icon = LANDING_ICONS[guarantee.icon];
              return (
                // A `dl` may only contain `dt`/`dd` pairs, optionally wrapped
                // in a single `div` per pair — so the icon lives inside the
                // `dt` rather than as a third sibling, and the description is
                // indented to the same 40px + 16px gutter the icon occupies.
                <div
                  key={guarantee.title}
                  className="hover:bg-background-alt/50 p-5 transition-colors sm:p-6"
                >
                  <dt className="website-body text-foreground flex items-center gap-4 font-medium">
                    <span className="bg-accent-subtle/80 text-accent-text flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)]">
                      <Icon className="size-4.5" aria-hidden />
                    </span>
                    <span>{guarantee.title}</span>
                  </dt>
                  <dd className="website-body text-muted mt-1 pl-14">{guarantee.description}</dd>
                </div>
              );
            })}
          </dl>
        </Reveal>
      </div>
    </Section>
  );
}

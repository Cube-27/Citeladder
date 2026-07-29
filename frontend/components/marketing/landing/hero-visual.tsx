'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { ENGINES } from '../primitives/engine-chip';
import { EngineLogo } from '../primitives/engine-logo';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const CYCLE_MS = 4200;

const OUTCOME = {
  named: { label: 'Named', cls: 'text-mkt-evidence-text', dot: 'bg-mkt-evidence' },
  cited: { label: 'Cited', cls: 'text-mkt-proof', dot: 'bg-mkt-proof' },
  missing: { label: 'Not mentioned', cls: 'text-mkt-signal-text', dot: 'bg-mkt-signal' },
} as const;

/**
 * The hero's ambient proof panel — the ONE piece of continuous motion above
 * the fold. It auto-cycles through the same illustrative buyer questions the
 * demo uses, so the first screen already shows the product's core move (a
 * question in, three engine verdicts out) rather than sitting as a blank right
 * column beside the headline.
 *
 * It is decorative-by-construction: `aria-hidden`, so the panel is never part
 * of the page's reading order (the interactive demo below is the real, labelled
 * control). Under reduced motion it holds the first question, fully legible,
 * and never advances — motion is additive, never load-bearing.
 */
export function HeroVisual() {
  const { questions } = LANDING_CONTENT.seeIt;
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(
      () => setActive((current) => (current + 1) % questions.length),
      CYCLE_MS,
    );
    return () => window.clearInterval(id);
  }, [reduceMotion, questions.length]);

  const current = questions[active];

  return (
    <div aria-hidden className="relative">
      {/* A soft slate halo grounds the panel so it reads as floating art, not
          a second content column competing with the headline. */}
      <div className="bg-mkt-accent-soft absolute -inset-6 -z-1 rounded-[2rem] opacity-70 blur-2xl" />
      <div className="bg-mkt-surface shadow-card-hover rounded-mkt-lg p-6 sm:p-7">
        <p className="text-mkt-meta text-mkt-ink-muted font-mono uppercase">A buyer asks</p>
        <div className="mt-2 min-h-[3.5rem]">
          <AnimatePresence mode="wait">
            <motion.p
              key={active}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
              className="text-mkt-ink text-mkt-body font-semibold"
            >
              “{current.question}”
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="border-mkt-line-soft mt-4 border-t pt-2">
          {current.answers.map((answer, index) => {
            const engine = ENGINES[answer.engine];
            const outcome = OUTCOME[answer.outcome];
            return (
              /* No AnimatePresence here: it only choreographs ENTER/EXIT of
                 children that mount and unmount, and each wrapper held exactly
                 one permanently-present row. The re-entry animation comes from
                 the `active`-keyed motion.div remounting on every cycle. */
              <motion.div
                key={`${active}-${answer.engine}`}
                initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.1 + index * 0.12 }}
                className="border-mkt-line-soft flex items-center gap-3 border-b py-3 last:border-b-0"
              >
                <span className="border-mkt-line bg-mkt-surface grid size-8 shrink-0 place-items-center rounded-lg border">
                  <EngineLogo engine={answer.engine} className={`size-4 ${engine.mark}`} />
                </span>
                <span className="text-mkt-ink text-mkt-sm flex-1 font-semibold">
                  {engine.label}
                </span>
                <span
                  className={`text-mkt-meta flex items-center gap-1.5 font-semibold uppercase ${outcome.cls}`}
                >
                  <span className={`size-1.5 rounded-full ${outcome.dot}`} />
                  {outcome.label}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* The cycle indicator doubles as motion the eye can track. */}
        <div className="mt-4 flex gap-1.5">
          {questions.map((question, index) => (
            <span
              key={question.category}
              className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                index === active ? 'bg-mkt-accent' : 'bg-mkt-line'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

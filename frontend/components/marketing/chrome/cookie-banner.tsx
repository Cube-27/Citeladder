'use client';

import Link from 'next/link';
import { useCallback, useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import { readConsent, writeConsent, type ConsentDecision } from '@/lib/consent/cookie-consent';
import { cn } from '@/lib/utils';

import { Container } from '../primitives/section';

/**
 * The public website's outlined alternate action, matching `ButtonLink`'s
 * `dark`/`nav` treatment. The shared `secondary` fill is the authenticated
 * flows' tonal quiet action and reads wrong on the marketing paper ground.
 */
const MARKETING_SECONDARY =
  'border-border-strong bg-panel hover:border-border-bold hover:bg-background-alt';

/**
 * The cookie consent banner.
 *
 * The Cookie Policy already promised this ("Where a consent banner is
 * available on the site, you can update non-essential preferences there") while
 * no banner existed. This closes that gap, and it is the gate analytics must
 * pass through before any tag ships.
 *
 * Accept or reject, both one click and equally prominent — a reject path that
 * is harder to reach than accept is the specific dark pattern regulators name.
 * There are no category toggles: nothing non-essential is installed yet, so a
 * granular panel would ask visitors to arbitrate over cookies that do not
 * exist. When the first analytics tag lands, this is where categories go.
 *
 * The decision lives in `localStorage`, which the server cannot read, so it is
 * subscribed to through `useSyncExternalStore`: the server snapshot is
 * `'pending'` and renders nothing, which keeps hydration matched and stops the
 * banner flashing at visitors who already answered. Writing notifies the
 * subscribers, so the answer also propagates to any other tab.
 */

/** `'pending'` is the pre-hydration snapshot — distinct from an undecided visitor. */
type BannerState = ConsentDecision | 'undecided' | 'pending';

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab answering should dismiss the banner here too.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): BannerState {
  return readConsent() ?? 'undecided';
}

export function CookieBanner() {
  const state = useSyncExternalStore<BannerState>(subscribe, getSnapshot, () => 'pending');

  const decide = useCallback((next: ConsentDecision) => {
    writeConsent(next);
    for (const listener of listeners) listener();
  }, []);

  if (state !== 'undecided') return null;

  return (
    <section
      // A landmark `section`, not a `dialog`: this does not trap focus or
      // block the page, and announcing it as a dialog would imply both.
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[var(--z-index-overlay)] print:hidden"
    >
      <Container className="pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="border-border-strong bg-panel flex flex-col gap-4 rounded-[var(--radius-card)] border p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
          <p className="website-body text-muted max-w-[68ch]">
            We use strictly necessary cookies to keep you signed in and secure the site. With your
            consent we would also use non-essential cookies to understand how the site is used. See
            our{' '}
            <Link
              href="/cookies"
              className="text-foreground underline underline-offset-4 hover:no-underline"
            >
              Cookie Policy
            </Link>
            .
          </p>
          {/* Reject first in the DOM so it is the first tab stop, and visually
              equal in weight — neither choice is nudged. */}
          <div className="flex shrink-0 gap-3">
            <Button
              variant="secondary"
              className={cn(MARKETING_SECONDARY)}
              onClick={() => decide('rejected')}
            >
              Reject
            </Button>
            <Button variant="primary" onClick={() => decide('accepted')}>
              Accept
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

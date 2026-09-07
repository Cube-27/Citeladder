import { ArrowRight, Sparkles } from 'lucide-react';

import { DemoButtonLink } from '../primitives/button';
import { Container } from '../primitives/section';

/**
 * Temporary announcement strip displayed while self-serve billing is in early access.
 * To remove when automated billing is active, simply remove this component from
 * `frontend/app/(marketing)/pricing/page.tsx`.
 */
export function PricingComingSoonStrip() {
  return (
    <aside
      aria-label="Early access announcement"
      className="relative z-10 -mt-4 mb-8 sm:-mt-6 sm:mb-12"
    >
      <Container>
        <div className="border-accent-border/60 bg-accent-soft/70 flex flex-col items-start justify-between gap-4 rounded-[var(--radius-card)] border p-4 shadow-xs backdrop-blur-xs sm:flex-row sm:items-center sm:gap-6 sm:p-5">
          <div className="flex flex-col gap-1.5 sm:gap-1">
            <div className="flex items-center gap-2">
              <span className="bg-accent text-accent-fg inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide">
                <Sparkles className="size-3" aria-hidden />
                Coming Soon
              </span>
              <span className="text-foreground text-sm font-semibold">
                Self-serve subscriptions are launching soon
              </span>
            </div>
            <p className="website-body text-muted">
              We are currently onboarding teams for early access directly. Talk to our team to
              reserve your tier or get custom audit terms.
            </p>
          </div>
          <DemoButtonLink variant="primary" className="w-full shrink-0 sm:w-auto">
            <span>Request Early Access</span>
            <ArrowRight aria-hidden />
          </DemoButtonLink>
        </div>
      </Container>
    </aside>
  );
}

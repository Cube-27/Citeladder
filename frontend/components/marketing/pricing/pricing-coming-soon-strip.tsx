import { ArrowRight } from 'lucide-react';

import { DemoButtonLink } from '../primitives/button';
import { Container } from '../primitives/section';

/** Rendered only for a published catalog with self-serve checkout unavailable. */
export function PricingComingSoonStrip() {
  return (
    <aside
      aria-label="Early access announcement"
      className="relative z-10 -mt-4 mb-8 sm:-mt-6 sm:mb-12"
    >
      <Container>
        <div className="border-accent-border/60 bg-accent-soft/70 flex flex-col items-start justify-between gap-4 rounded-[var(--radius-card)] border p-4 backdrop-blur-xs sm:flex-row sm:items-center sm:gap-6 sm:p-5">
          <div className="flex flex-col gap-1.5 sm:gap-1">
            <h2 className="website-small-heading text-foreground">
              Self-serve checkout is coming soon.
            </h2>
            <p className="website-body text-muted">
              You can review the published plans below. Contact us to discuss early access and
              confirm the options available to your team.
            </p>
          </div>
          <DemoButtonLink variant="primary" className="w-full shrink-0 sm:w-auto">
            <span>Request early access</span>
            <ArrowRight aria-hidden />
          </DemoButtonLink>
        </div>
      </Container>
    </aside>
  );
}

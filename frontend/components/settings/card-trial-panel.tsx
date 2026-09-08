'use client';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';

/** Approved future state only. It deliberately contains no card fields or mutation. */
export function CardTrialPanel() {
  return (
    <section className={panelClasses({}, 'grid gap-4')} aria-labelledby="future-trial-title">
      <div className="grid gap-1">
        <p className={textRole('eyebrow')}>Future flow</p>
        <h2 id="future-trial-title" className={textRole('bodyStrong')}>
          Tier 1 card trial
        </h2>
        <p className="text-secondary text-sm">
          A 7-day trial would begin only after verified authorization in Razorpay hosted checkout.
          It is separate from no-card early access.
        </p>
      </div>
      <Alert tone="warning">
        Unavailable today. Tax, merchant capability, provider readiness, and the exact server quote
        must be verified before this flow can open.
      </Alert>
      <div className="grid gap-2 text-sm">
        <p className={textRole('bodyStrong')}>Before hosted handoff</p>
        <Checkbox
          checked={false}
          onCheckedChange={() => undefined}
          disabled
          label="Privacy and provider data-sharing consent"
        />
        <Checkbox
          checked={false}
          onCheckedChange={() => undefined}
          disabled
          label="Recurring Tier 1 renewal and cancellation consent"
        />
      </div>
      <p className="text-muted text-xs">
        CiteLadder never collects or stores PAN, CVV, or card expiry. When available, authorization
        happens only on Razorpay and CiteLadder stores opaque references and status.
      </p>
      <Button disabled>Authorize card & start trial — unavailable</Button>
    </section>
  );
}

import Link from 'next/link';
import { BarChart3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Empty state for `/analytics` with no AI-referral data yet. The CTA lands on
 * Settings → Integrations — the GA4 connection whose referral sessions (with
 * completed-audit visibility snapshots) feed this screen.
 *
 * Copy is one line: the old version listed what the screen would eventually
 * contain (referral volume, per-source breakdowns, the visibility↔referral
 * correlation), which the screen itself makes obvious once it has data.
 */
export function AnalyticsEmptyState() {
  return (
    <EmptyState
      icon={BarChart3}
      heading="No AI-referral data yet"
      description="Connect Google Analytics 4 to see which AI sources send you traffic."
      action={
        <Button asChild size="md">
          <Link href="/settings?tab=integrations">Open integration settings</Link>
        </Button>
      }
    />
  );
}

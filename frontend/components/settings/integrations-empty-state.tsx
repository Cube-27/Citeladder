'use client';

import { Unplug } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { integrationsApi } from '@/lib/api/integrations';
import { assignLocation } from '@/lib/navigate';

/**
 * Empty state for the Settings → Integrations tab when the workspace has no
 * connections yet, in the shared `EmptyState` shape (icon beside the heading,
 * one line of copy, then the CTAs).
 *
 * Both CTAs are full-page navigations to the same-origin OAuth start
 * endpoints (302s — never apiClient fetches): one Google consent links Search
 * Console + Analytics 4 on a shared grant; Bing needs its own consent because
 * a Google token cannot authorize Bing Webmaster Tools (the Bing account
 * itself may still have been created with a Google ID).
 */
export function IntegrationsEmptyState() {
  return (
    <div data-testid="integrations-empty-state">
      <EmptyState
        icon={Unplug}
        heading="No integrations connected"
        description="One Google consent connects Search Console and Analytics 4. Bing Webmaster Tools needs its own sign-in."
        action={
          <>
            <Button size="md" onClick={() => assignLocation(integrationsApi.oauthStartUrl('gsc'))}>
              Connect Google
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={() => assignLocation(integrationsApi.oauthStartUrl('bing'))}
            >
              Connect Bing
            </Button>
          </>
        }
      />
    </div>
  );
}

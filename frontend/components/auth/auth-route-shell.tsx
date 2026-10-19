import type { ReactNode } from 'react';

import { Inline } from '@/components/ui/layout';
import { websiteHref } from '@/lib/config/app-link';
import { PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { SITE_TAGLINE } from '@/lib/seo/site';

import { FlowShell } from './flow-shell';

/**
 * Account access on the public stage: one sheet split into the task and a calm
 * brand panel. Below the split breakpoint the panel drops away and the sheet
 * narrows back to the form alone.
 */
export function AuthRouteShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <FlowShell
      mainLabel="Account access"
      align="center"
      // The shell owns the one sheet. This route only shapes it.
      measure="auth"
      footer={<AuthLegalFooter />}
    >
      <div className="auth-split-form">{children}</div>
      <AuthBrandPanel />
    </FlowShell>
  );
}

/** The site tagline over an illustrative answer with a cited source. */
function AuthBrandPanel() {
  return (
    <aside className="auth-brand-panel" aria-label="About CiteLadder">
      <p className="auth-brand-tagline">{SITE_TAGLINE}</p>
      <div className="auth-brand-scene" aria-hidden="true">
        <div className="auth-brand-card surface-card">
          <div className="auth-brand-dots">
            <span />
            <span />
            <span />
          </div>
          <span className="auth-brand-line" />
          <span className="auth-brand-line" data-length="long" />
          <span className="auth-brand-line" data-length="short" />
          <div className="auth-brand-sources">
            <span data-cited="true" />
            <span />
            <span />
          </div>
        </div>
        <div className="auth-brand-card auth-brand-chart surface-card">
          <span data-step="1" />
          <span data-step="2" />
          <span data-step="3" />
          <span data-step="4" />
          <span data-step="5" />
        </div>
      </div>
    </aside>
  );
}

// Read once at load; rendering stays pure.
const COPYRIGHT_YEAR = new Date().getFullYear();

function AuthLegalFooter() {
  return (
    <Inline gap="tight" className="website-label text-muted flex-wrap justify-center text-center">
      <span>
        © {COPYRIGHT_YEAR} CiteLadder, a {PARENT_COMPANY.name} product
      </span>
      <span aria-hidden="true">·</span>
      <a
        href={websiteHref('/privacy')}
        target="_blank"
        rel="noreferrer"
        className="hover:text-foreground transition-colors"
      >
        Privacy
      </a>
      <span aria-hidden="true">·</span>
      <a
        href={websiteHref('/terms')}
        target="_blank"
        rel="noreferrer"
        className="hover:text-foreground transition-colors"
      >
        Terms
      </a>
    </Inline>
  );
}

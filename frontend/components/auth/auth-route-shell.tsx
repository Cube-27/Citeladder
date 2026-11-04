import type { ReactNode } from 'react';
import '@/apps/app/src/website-type.css';

import { Inline } from '@/components/ui/layout';
import { websiteHref } from '@/lib/config/app-link';
import { PARENT_COMPANY } from '@/lib/marketing-content/legal';

import { AuthShowcase } from './auth-showcase';
import { AuthWordmark } from './brand-panel';

/**
 * Account access across the whole viewport: the logo and task in a roomy
 * column on white, and from 900px a product showcase beside it. Below the
 * split breakpoint the showcase drops away and the form has the width.
 */
export function AuthRouteShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div data-flow-surface className="auth-split bg-paper text-ink antialiased">
      <div className="auth-split-main">
        <main id="main" aria-label="Account access" className="auth-split-content">
          <div className="auth-split-form">
            <div className="flex justify-center">
              <AuthWordmark />
            </div>
            {children}
          </div>
        </main>
        <footer className="auth-split-footer">
          <AuthLegalFooter />
        </footer>
      </div>
      <AuthShowcase />
    </div>
  );
}

// Read once at load; rendering stays pure.
const COPYRIGHT_YEAR = new Date().getFullYear();

function AuthLegalFooter() {
  return (
    <Inline
      gap="tight"
      className="website-label text-ink-muted flex-wrap justify-center text-center"
    >
      <span>
        © {COPYRIGHT_YEAR} CiteLadder, a {PARENT_COMPANY.name} product
      </span>
      <span aria-hidden="true">·</span>
      <a
        href={websiteHref('/privacy')}
        target="_blank"
        rel="noreferrer"
        className="hover:text-ink transition-colors"
      >
        Privacy
      </a>
      <span aria-hidden="true">·</span>
      <a
        href={websiteHref('/terms')}
        target="_blank"
        rel="noreferrer"
        className="hover:text-ink transition-colors"
      >
        Terms
      </a>
    </Inline>
  );
}

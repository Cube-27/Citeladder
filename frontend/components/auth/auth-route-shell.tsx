import type { ReactNode } from 'react';

import { websiteHref } from '@/lib/config/app-link';
import { PARENT_COMPANY } from '@/lib/marketing-content/legal';

import { FlowShell } from './flow-shell';

export function AuthRouteShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <FlowShell
      mainLabel="Account access"
      align="center"
      // The shell owns the one sheet. This route only narrows it.
      measure="auth"
      footer={<AuthLegalFooter />}
    >
      {children}
    </FlowShell>
  );
}

// Read once at load; rendering stays pure.
const COPYRIGHT_YEAR = new Date().getFullYear();

function AuthLegalFooter() {
  return (
    <div className="website-label text-muted flex flex-wrap justify-center gap-x-1.5 text-center">
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
    </div>
  );
}

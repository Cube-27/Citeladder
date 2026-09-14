import type { ReactNode } from 'react';

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

function AuthLegalFooter() {
  return (
    <div className="website-label text-muted flex flex-wrap justify-center gap-x-1.5 text-center">
      <span>
        © {new Date().getFullYear()} CiteLadder, a {PARENT_COMPANY.name} product
      </span>
      <span aria-hidden="true">·</span>
      <a
        href={PARENT_COMPANY.privacyHref}
        target="_blank"
        rel="noreferrer"
        className="hover:text-foreground transition-colors"
      >
        Privacy
      </a>
      <span aria-hidden="true">·</span>
      <a
        href={PARENT_COMPANY.termsHref}
        target="_blank"
        rel="noreferrer"
        className="hover:text-foreground transition-colors"
      >
        Terms
      </a>
    </div>
  );
}

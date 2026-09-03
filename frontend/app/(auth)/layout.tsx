import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { FlowShell } from '@/components/auth/flow-shell';
import { PARENT_COMPANY } from '@/lib/marketing-content/legal';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Auth and onboarding share one focused light-ground flow shell.
 */
export default async function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  'use cache';

  return (
    <FlowShell
      mainLabel="Account access"
      align="center"
      footer={
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
      }
    >
      <div className="flow-auth-content">{children}</div>
    </FlowShell>
  );
}

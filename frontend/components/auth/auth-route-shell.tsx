import type { ReactNode } from 'react';

import { AuthSplitShell } from '@/components/ui/auth-shell';
import { TextLink } from '@/components/ui/text-link';
import { websiteHref } from '@/lib/config/app-link';
import { PARENT_COMPANY } from '@/lib/marketing-content/legal';

// Read once at load; rendering stays pure.
const COPYRIGHT_YEAR = new Date().getFullYear();

/**
 * Account access (sign-in, sign-up and the mailbox screens): the split shell
 * with the product showcase, closed by the copyright and legal links.
 */
export function AuthRouteShell({ children }: Readonly<{ children: ReactNode }>) {
  return <AuthSplitShell footer={<AuthLegalFooter />}>{children}</AuthSplitShell>;
}

function AuthLegalFooter() {
  return (
    <>
      © {COPYRIGHT_YEAR} CiteLadder, a {PARENT_COMPANY.name} product{' '}
      <span aria-hidden="true">·</span>{' '}
      <TextLink asChild tone="muted" text="inherit">
        <a href={websiteHref('/privacy')} target="_blank" rel="noreferrer">
          Privacy
        </a>
      </TextLink>{' '}
      <span aria-hidden="true">·</span>{' '}
      <TextLink asChild tone="muted" text="inherit">
        <a href={websiteHref('/terms')} target="_blank" rel="noreferrer">
          Terms
        </a>
      </TextLink>
    </>
  );
}

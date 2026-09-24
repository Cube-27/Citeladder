import type { BillingCatalog } from '@/lib/api/billing';
import { websiteHref } from '@/lib/config/app-link';
import { PARENT_COMPANY } from '@/lib/marketing-content/legal';

import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';

const LINK = 'text-accent-text underline underline-offset-2';

function PolicyLink({ path, children }: Readonly<{ path: `/${string}`; children: string }>) {
  return (
    <a className={LINK} href={websiteHref(path)} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/**
 * What the buyer agrees to, shown beside every confirm-and-pay control.
 *
 * A recurring plan authorises a monthly charge until cancelled; a one-time
 * purchase (add-on, top-up, upgrade proration) authorises exactly one charge.
 * Both are bound by the same three policies.
 */
export function CheckoutConsent({ recurring }: Readonly<{ recurring: boolean }>) {
  return (
    <p className={textRole('meta')}>
      {recurring
        ? 'By continuing you authorise a recurring monthly charge of the quoted total until you cancel. Cancellation takes effect at the end of the paid period. '
        : 'By continuing you authorise a single charge of the quoted total. It does not renew. '}
      You agree to the <PolicyLink path="/terms">Terms of Service</PolicyLink>,{' '}
      <PolicyLink path="/refund-policy">Refund Policy</PolicyLink> and{' '}
      <PolicyLink path="/cancellation-policy">Cancellation Policy</PolicyLink>.
    </p>
  );
}

/**
 * Billing support. The catalog's own contact wins; the operator's published
 * contact is the fallback when the catalog carries none. An empty phone is
 * hidden rather than shown as a blank line.
 */
export function BillingSupport({
  contact,
}: Readonly<{ contact: BillingCatalog['support_contact'] }>) {
  const email = contact?.email || PARENT_COMPANY.email;
  const url = contact?.contact_url || PARENT_COMPANY.contactHref;
  return (
    <section className={panelClasses({}, 'grid gap-2')} aria-labelledby="billing-support-title">
      <h2 id="billing-support-title" className={textRole('sectionTitle')}>
        Billing help
      </h2>
      <p className={textRole('body')}>
        Questions about a charge, a refund or cancelling? Email{' '}
        <a className={LINK} href={`mailto:${email}`}>
          {email}
        </a>
        {contact?.phone ? `, call ${contact.phone}` : ''} or use the{' '}
        <a className={LINK} href={url} target="_blank" rel="noreferrer">
          contact form
        </a>
        . Include your workspace name and the invoice number; never send card details.
      </p>
      <p className={textRole('meta')}>
        <PolicyLink path="/refund-policy">Refund Policy</PolicyLink> ·{' '}
        <PolicyLink path="/cancellation-policy">Cancellation Policy</PolicyLink> ·{' '}
        <PolicyLink path="/terms">Terms of Service</PolicyLink>
      </p>
    </section>
  );
}

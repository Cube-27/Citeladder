import type { BillingCatalog } from '@/lib/api/billing';
import { websiteHref } from '@/lib/config/app-link';
import { PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { contactSalesHref } from '@/lib/config/contact-sales';

import { SettingRow, SettingRows, SettingsGroup } from '@/components/ui/setting-row';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';

function PolicyLink({ path, children }: Readonly<{ path: `/${string}`; children: string }>) {
  return (
    <TextLink asChild variant="external" text="inherit">
      <a href={websiteHref(path)} target="_blank" rel="noreferrer" className="whitespace-nowrap">
        {children}
      </a>
    </TextLink>
  );
}

export function CheckoutConsent({ recurring }: Readonly<{ recurring: boolean }>) {
  return (
    <p className={textRole('caption')}>
      {recurring
        ? 'By continuing you authorise a recurring monthly charge of the quoted total until you cancel. Cancellation takes effect at the end of the paid period. '
        : 'By continuing you authorise a single charge of the quoted total. It does not renew. '}
      You agree to the <PolicyLink path="/terms">Terms of Service</PolicyLink>,{' '}
      <PolicyLink path="/refund-policy">Refund Policy</PolicyLink> and{' '}
      <PolicyLink path="/cancellation-policy">Cancellation Policy</PolicyLink>.
    </p>
  );
}

export function BillingSupport({
  contact,
}: Readonly<{ contact: BillingCatalog['support_contact'] }>) {
  const email = contact?.email || PARENT_COMPANY.email;
  const url = contactSalesHref(contact?.contact_url, websiteHref('/contact'));
  return (
    <SettingsGroup title="Billing help">
      <SettingRows>
        <SettingRow
          label="Email"
          value={
            <TextLink asChild text="inherit">
              <a href={`mailto:${email}`}>{email}</a>
            </TextLink>
          }
        />
        {contact?.phone ? <SettingRow label="Phone" value={contact.phone} /> : null}
        <SettingRow
          label="Contact"
          value={
            <TextLink asChild variant="external" text="inherit">
              <a href={url} target="_blank" rel="noreferrer" className="whitespace-nowrap">
                contact form
              </a>
            </TextLink>
          }
        />
        <SettingRow
          label="Policies"
          value={
            <>
              <PolicyLink path="/refund-policy">Refund Policy</PolicyLink> ·{' '}
              <PolicyLink path="/cancellation-policy">Cancellation Policy</PolicyLink> ·{' '}
              <PolicyLink path="/terms">Terms of Service</PolicyLink>
            </>
          }
        />
      </SettingRows>
    </SettingsGroup>
  );
}

import { PARENT_COMPANY } from './legal';
import { FOUNDER, PRODUCT_HEAD } from './people';

/**
 * Social/contact content for the marketing chrome (footer social row, contact
 * CTAs). All entries are owner-supplied; empty states degrade gracefully
 * (footer social row hidden, Contact link omitted).
 *
 * Icons are not Lucide brand glyphs (that pack omits LinkedIn). The footer
 * renders BrandLogo from the profile URL so Logo.dev can supply the mark when
 * NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE is set, then initials.
 */

export type SocialLink = {
  key: string;
  label: string;
  href: string;
  /** Adjacent accessible name for the logo treatment. */
  brand: string;
};

export const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    key: 'linkedin-product',
    label: `${PRODUCT_HEAD.name} on LinkedIn`,
    href: PRODUCT_HEAD.linkedin,
    brand: 'LinkedIn',
  },
  {
    key: 'linkedin-founder',
    label: `${FOUNDER.name} on LinkedIn`,
    href: FOUNDER.linkedin,
    brand: 'LinkedIn',
  },
  {
    key: 'linkedin-cube27',
    label: `${PARENT_COMPANY.name} on LinkedIn`,
    href: PARENT_COMPANY.linkedin,
    brand: 'LinkedIn',
  },
];

export const CONTACT_EMAIL = PRODUCT_HEAD.email;

import { type LucideIcon } from 'lucide-react';

/**
 * Social/contact content for the marketing chrome (footer social row, contact
 * CTAs). All entries are owner-supplied; empty states degrade gracefully
 * (footer social row hidden, Contact link omitted).
 */

export type SocialLink = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const SOCIAL_LINKS: readonly SocialLink[] = [];

// Public contact email. Empty is a supported state: the footer omits the Contact
// link entirely rather than rendering a dead target. Owner-supplied — see
// docs/operations/razorpay-and-demo-owner-requirements.md §7.
export const CONTACT_EMAIL = '';

/**
 * Every published policy, in footer order. Each is served by the legal
 * route from its own record; Contact shares the footer row but is a page
 * with its own route.
 */
import { AI_POLICY, COOKIE_POLICY, type LegalDocument } from './legal';
import { CANCELLATION_POLICY, CONTACT_PAGE, REFUND_POLICY } from './legal-billing';
import { DATA_PROCESSING_AGREEMENT, SUBPROCESSORS } from './legal-dpa';
import { PRIVACY_POLICY } from './legal-privacy';
import { TERMS_OF_SERVICE } from './legal-terms';

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  TERMS_OF_SERVICE,
  PRIVACY_POLICY,
  REFUND_POLICY,
  CANCELLATION_POLICY,
  COOKIE_POLICY,
  AI_POLICY,
  DATA_PROCESSING_AGREEMENT,
  SUBPROCESSORS,
  CONTACT_PAGE,
];

/** The footer's legal row and the policies rail. */
export const FOOTER_LEGAL_LINKS: readonly { label: string; href: LegalDocument['path'] }[] =
  LEGAL_DOCUMENTS.map((document) => ({
    label: document.navLabel ?? document.title,
    href: document.path,
  }));

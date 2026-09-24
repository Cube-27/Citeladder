import { LEGAL_ENTITY, PARENT_COMPANY, type LegalDocument } from './legal';

/**
 * Refund, cancellation and contact pages. The mechanics (period-end
 * cancellation, next-renewal downgrades, one-time add-ons, full-refund grant
 * revocation) are the approved billing behaviour; the refund window for a
 * mistaken add-on purchase and fixed response-time targets are still owner
 * decisions and are deliberately absent.
 */
const email = PARENT_COMPANY.email;

export const REFUND_POLICY: LegalDocument = {
  slug: 'refund-policy',
  title: 'Refund Policy',
  description: 'When CiteLadder purchases are refunded, how to ask, and what a refund changes.',
  sections: [
    {
      id: 'scope',
      title: 'Scope',
      paragraphs: [
        `This Policy applies to subscriptions, add-ons and top-ups purchased directly from ${PARENT_COMPANY.legalName} for CiteLadder. A signed enterprise agreement controls where it expressly provides different terms. Nothing here limits a refund or other remedy required by applicable law.`,
      ],
    },
    {
      id: 'subscriptions',
      title: 'Subscriptions and ordinary cancellation',
      paragraphs: [
        'Where granted, an invitation-based trial requires no payment card and never charges at expiry.',
        'Once a paid subscription is activated and made available, there is no general change-of-mind refund. Cancelling stops the next renewal and leaves access available through the current paid period; it does not refund the unused part of that period. See the Cancellation Policy at /cancellation-policy.',
      ],
    },
    {
      id: 'eligibility',
      title: 'When we refund',
      bullets: [
        'Duplicate charges, and charges above the confirmed purchase amount caused by our billing error.',
        'A purchase that was paid for but not delivered, where we cannot remedy it within a reasonable time.',
        'The unused prepaid amount of a paid Service we discontinue without your breach, where we cannot offer a reasonably acceptable alternative.',
        'Any refund that applicable law requires.',
      ],
    },
    {
      id: 'not-a-basis',
      title: 'What is not, by itself, a refund basis',
      paragraphs: [
        'A change in AI answers, rankings, citations, traffic or another outcome we do not guarantee is not, by itself, a basis for a refund. This does not excuse a failure to provide functionality we expressly sold.',
        'An add-on or top-up expiring under its purchase terms, or becoming unusable because the base subscription ended, does not by itself create a refund right.',
      ],
    },
    {
      id: 'requesting',
      title: 'Requesting a refund',
      paragraphs: [
        `Email ${email} from the account email, stating your workspace, the invoice or payment reference, the purchase date, the amount and the reason. Never send full card numbers, security codes, passwords or one-time payment codes.`,
        'We may ask for information reasonably needed to verify the purchase, and we will explain a rejection or any investigation we need to carry out.',
      ],
    },
    {
      id: 'processing',
      title: 'Processing and payment method',
      paragraphs: [
        'An approved refund is returned to the original payment method. After we initiate it, Razorpay and your bank control when the funds appear; Razorpay currently estimates 7 to 10 business days for a normal refund, varying by payment method and bank. That is an estimate, not a guaranteed date. We will share the refund reference and help if the credit is delayed.',
        'We do not deduct our payment-processing costs from a refund that corrects our own duplicate or incorrect charge, or from a refund the law requires in full.',
      ],
    },
    {
      id: 'effect',
      title: 'Effect on access and tax records',
      paragraphs: [
        'A full refund revokes the remaining access granted by the refunded purchase from the time of the refund. Credits already used are not restored or clawed back. A partial refund does not cancel the subscription or remove remaining access. Refunding an add-on or top-up alone does not cancel the base subscription.',
        'Every refund, full or partial, issues a credit note against the original invoice.',
        'Please contact us about a disputed charge so we can investigate. This does not require you to give up a chargeback or any other right under law or payment-network rules.',
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      paragraphs: [`Refund questions: ${email}.`],
    },
  ],
};

export const CANCELLATION_POLICY: LegalDocument = {
  slug: 'cancellation-policy',
  title: 'Cancellation Policy',
  description: 'How to cancel a CiteLadder subscription and what happens to access and data.',
  sections: [
    {
      id: 'how',
      title: 'How to cancel',
      paragraphs: [
        `A workspace billing owner may cancel a CiteLadder subscription at any time before the next renewal in the app’s Billing section. If that control is unavailable, or you cannot access the account, email ${email} from the account email. We may verify your authority before acting.`,
        'There is no cancellation fee. We confirm the date the cancellation takes effect. A timely request is not treated as late because our cancellation control or support handling failed.',
      ],
    },
    {
      id: 'effect',
      title: 'When it takes effect',
      paragraphs: [
        'Cancellation stops future renewal and takes effect at the end of the current paid period. You keep that period’s paid access, subject to the plan’s limits and our Terms. It does not add another period of access or reset used credits.',
        'A renewal that happened before you cancelled is covered by the Refund Policy at /refund-policy. A renewal charged after a timely, effective cancellation will be corrected.',
      ],
    },
    {
      id: 'plan-changes',
      title: 'Plan changes and additional purchases',
      paragraphs: [
        'A downgrade takes effect at the next renewal, without a refund for the current period. An upgrade takes effect once you confirm and pay the displayed prorated charge.',
        'Add-ons and top-ups are one-time purchases. Each stays usable until 30 days after purchase or the end of your paid subscription, whichever comes first. Use stops when paid access ends; renewing before a purchase’s original expiry restores its remaining use without extending that expiry. They never renew automatically.',
      ],
    },
    {
      id: 'refunds',
      title: 'Cancellation is not a refund',
      paragraphs: [
        'Cancellation and refund are separate. Ordinary cancellation does not produce a prorated refund. The Refund Policy covers billing errors, non-delivery and legally required refunds.',
      ],
    },
    {
      id: 'data',
      title: 'Project data',
      paragraphs: [
        `Cancelling does not immediately delete your workspace or project history. You can ask for an export or for earlier deletion by emailing ${email}; the Privacy Policy at /privacy describes how we handle those requests.`,
        'Removing a workspace member, disconnecting an integration and cancelling a subscription are different actions. None of them performs the others automatically.',
      ],
    },
    {
      id: 'enterprise',
      title: 'Enterprise orders',
      paragraphs: [
        'A signed enterprise order may set a fixed term, notice period or other cancellation terms. Those terms control where they expressly differ, subject to mandatory rights.',
        `Contact: ${email}.`,
      ],
    },
  ],
};

const entityLines = [
  `CiteLadder is a product of ${PARENT_COMPANY.legalName}.`,
  `Principal business address: ${PARENT_COMPANY.address}.`,
  LEGAL_ENTITY.registrationNumber
    ? `Company registration number: ${LEGAL_ENTITY.registrationNumber}.`
    : null,
  LEGAL_ENTITY.phone ? `Business telephone: ${LEGAL_ENTITY.phone}.` : null,
].filter((line): line is string => line !== null);

export const CONTACT_PAGE: LegalDocument = {
  slug: 'contact',
  title: 'Contact',
  description: 'How to reach CiteLadder for support, billing, privacy and complaints.',
  sections: [
    {
      id: 'company',
      title: 'Who we are',
      paragraphs: entityLines,
    },
    {
      id: 'support',
      title: 'Support, billing and privacy',
      paragraphs: [
        `For support, billing, cancellation, refunds, privacy requests or crawler concerns, email ${email}. You can also reach us through ${PARENT_COMPANY.contactHref}.`,
        'Include your workspace or account email and any relevant invoice, payment or request reference. Never send passwords, API keys, full payment-card numbers or one-time payment codes.',
      ],
    },
    {
      id: 'grievances',
      title: 'Complaints and grievances',
      paragraphs: [
        LEGAL_ENTITY.grievanceContact
          ? `Grievance contact: ${LEGAL_ENTITY.grievanceContact}, ${email}.`
          : `Send complaints and grievances to ${email}, marked “Grievance”.`,
        'We acknowledge every complaint and explain the next steps where more information or investigation is needed. This process does not remove your right to approach a competent authority or forum.',
      ],
    },
  ],
};

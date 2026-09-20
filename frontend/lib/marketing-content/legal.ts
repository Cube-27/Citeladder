/**
 * Legal entity + document content for marketing legal pages and the footer
 * strip. Company registration fields are owner-supplied — leave blank until
 * filled; the UI renders an em dash rather than inventing details.
 */

export type LegalEntity = {
  /** Registered company name, e.g. "CiteLadder Ltd". */
  legalName: string;
  /** Product / trading name shown in public copy. */
  tradingName: string;
  /** Company registration / filing number. */
  registrationNumber: string;
  /** e.g. "England and Wales" or "Delaware, U.S.A." */
  registrationJurisdiction: string;
  /** Registered office / principal business address. */
  address: string;
  /** Privacy contact email. */
  privacyEmail: string;
  /** General support / legal contact email. */
  supportEmail: string;
  /** ISO date string shown as "Last updated". */
  lastUpdated: string;
  /** Governing law label, e.g. "England and Wales". */
  governingLaw: string;
};

/**
 * Owner blockers — fill before launch. Empty strings render as "—" on pages
 * and are omitted from sentences that would otherwise invent a jurisdiction.
 */
export const LEGAL_ENTITY: LegalEntity = {
  // Keep trading name for the copyright line. Cube27 IT Pvt. Ltd. is the parent.
  legalName: '',
  tradingName: 'CiteLadder',
  registrationNumber: '',
  registrationJurisdiction: 'India',
  address:
    'Plot No. 12, Mulberry Gardens 1, Magarpatta City, Hadapsar, Pune, Maharashtra 411013, India',
  privacyEmail: 'contact@cube27.com',
  supportEmail: 'abhineet.jain@cube27.com',
  lastUpdated: '2026-09-03',
  governingLaw: 'India',
};

/**
 * The parent company. CiteLadder is a Cube27 product, so the corporate legal
 * documents — privacy and terms — are Cube27's and are linked at their
 * canonical URLs rather than duplicated here. A second copy of a policy is a
 * copy that goes stale silently, and the entity the policy binds is Cube27.
 *
 * The product-specific policies (cookies, AI) stay on this surface because
 * they describe CiteLadder's own runtime behaviour.
 */
export const PARENT_COMPANY = {
  name: 'Cube27',
  legalName: 'Cube27 IT Pvt. Ltd.',
  href: 'https://www.cube27.com/',
  privacyHref: 'https://www.cube27.com/privacy-policy/',
  termsHref: 'https://www.cube27.com/terms-of-service/',
  address:
    'Plot No. 12, Mulberry Gardens 1, Magarpatta City, Hadapsar, Pune, Maharashtra 411013, India',
  email: 'contact@cube27.com',
  linkedin: 'https://www.linkedin.com/company/cube27ltd',
} as const;

export function legalDisplayName(): string {
  return LEGAL_ENTITY.legalName.trim() || LEGAL_ENTITY.tradingName;
}

function legalContactEmail(): string {
  return LEGAL_ENTITY.privacyEmail.trim() || LEGAL_ENTITY.supportEmail.trim();
}

type LegalSection = {
  id: string;
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
  note?: string;
  storage?: readonly { name: string; purpose: string; duration: string; category: string }[];
};

export type LegalDocument = {
  slug: 'cookies' | 'ai-policy';
  title: string;
  description: string;
  lastUpdated?: string;
  sections: readonly LegalSection[];
};

const entity = () => legalDisplayName();
const contact = () => {
  const email = legalContactEmail();
  return email || '[privacy contact — to be completed]';
};

export const COOKIE_POLICY: LegalDocument = {
  slug: 'cookies',
  title: 'Cookie Policy',
  description: 'How CiteLadder uses cookies and similar technologies on the website and platform.',
  lastUpdated: '2026-09-20',
  sections: [
    {
      id: 'intro',
      title: 'Introduction',
      paragraphs: [
        `This Cookie Policy explains how ${entity()} (“CiteLadder”, “we”, “us”) uses cookies and similar technologies on our websites and Services. It should be read with the Cube27 Privacy Policy at ${PARENT_COMPANY.privacyHref}.`,
        'Cookies are small text files stored on your device. We also use browser storage for your consent choice and product settings. Google Analytics is enabled only after you accept optional analytics.',
      ],
    },
    {
      id: 'types',
      title: 'Types of cookies we use',
      bullets: [
        'Strictly necessary — session, sign-in transaction, and consent-choice storage needed to provide the service and honour your choice.',
        'Preferences — browser storage remembers settings you choose inside the product, such as your active workspace.',
        'Analytics — when configured, Google Analytics measures website visits only after you accept optional cookies.',
      ],
    },
    {
      id: 'table',
      title: 'Cookies and related storage',
      paragraphs: [
        'The following first-party cookies and browser storage are used by CiteLadder. Google Analytics cookies appear only when analytics is configured and you accept. Browser limits can shorten the stated lifetimes.',
      ],
      storage: [
        {
          name: 'citeladder_session',
          purpose: 'Keeps you signed in; contains the protected session token.',
          duration: 'Up to 24 hours by default (server setting may differ)',
          category: 'Essential cookie',
        },
        {
          name: 'citeladder_session_hint',
          purpose: 'Shows signed-in navigation without exposing the session token.',
          duration: 'Same lifetime as the session cookie',
          category: 'Essential cookie',
        },
        {
          name: 'citeladder_auth_oauth, citeladder_integration_oauth',
          purpose: 'Protects a sign-in or integration connection while it completes.',
          duration: 'Up to 10 minutes; cleared after completion',
          category: 'Essential cookies',
        },
        {
          name: 'citeladder.cookie-consent',
          purpose: 'Remembers your accept or reject choice.',
          duration: 'Until you clear site data',
          category: 'Essential local storage',
        },
        {
          name: '_ga',
          purpose: 'Distinguishes visitors for Google Analytics.',
          duration: 'Up to 2 years by default',
          category: 'Optional analytics cookie',
        },
        {
          name: '_ga_<measurement-id>',
          purpose: 'Keeps Google Analytics session state.',
          duration: 'Up to 2 years by default',
          category: 'Optional analytics cookie',
        },
      ],
    },
    {
      id: 'manage',
      title: 'How to manage cookies',
      paragraphs: [
        'You can control cookies through your browser settings (block, delete, or alert on cookies). Blocking essential cookies may prevent sign-in or break core features.',
        'On your first visit we ask whether you accept optional analytics. We do not load Google Analytics or set its cookies before you accept; rejecting leaves it off. Essential cookies and storage can run either way. To change your answer, clear this site’s data in your browser and we will ask again.',
      ],
    },
    {
      id: 'third-parties',
      title: 'Third parties',
      paragraphs: [
        'Google Analytics processes website usage only after you accept optional analytics. Answer engines you connect via BYOK set their own cookies on their sites, not on CiteLadder.',
      ],
    },
    {
      id: 'changes',
      title: 'Changes',
      paragraphs: [
        'We may update this Cookie Policy as our practices change. The “Last updated” date will be revised when we do.',
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      paragraphs: [`Questions: ${contact()}.`],
    },
  ],
};

export const AI_POLICY: LegalDocument = {
  slug: 'ai-policy',
  title: 'AI Policy',
  description:
    'How CiteLadder uses AI systems in the product and what we do not do with your data.',
  sections: [
    {
      id: 'overview',
      title: 'Overview',
      paragraphs: [
        `${entity()} operates CiteLadder, an AEO analysis product. We observe how answer engines describe brands and products, persist raw responses as evidence, and score them with deterministic rules.`,
        `This AI Policy summarises how AI systems are involved. It does not replace the Cube27 Privacy Policy (${PARENT_COMPANY.privacyHref}) or Terms of Service (${PARENT_COMPANY.termsHref}).`,
      ],
    },
    {
      id: 'how',
      title: 'How AI is used',
      bullets: [
        'Answer engines (ChatGPT, Gemini, Claude, and any others you configure) generate responses when you run audits. Those calls use your BYOK credentials where configured.',
        'Scoring of mentions, citations, and related visibility metrics is deterministic over persisted artifacts — not an LLM judging another model’s answer.',
        'Optional product features may use models for assistance (for example drafting or research helpers). When they do, we will describe the purpose in-product.',
      ],
    },
    {
      id: 'not',
      title: 'What we do not do',
      bullets: [
        'We do not sell Customer Data.',
        'We do not use Customer Data to train third-party foundation models.',
        'We do not fabricate scores when evidence is missing — unavailable metrics render as an em dash.',
      ],
    },
    {
      id: 'human',
      title: 'Human oversight',
      paragraphs: [
        'CiteLadder is a measurement and evidence tool for professional teams. You remain responsible for decisions you make using the outputs. Raw answers and rule versions are available so you can verify scores.',
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      paragraphs: [`Questions about this Policy: ${contact()}.`],
    },
  ],
};

export type LegalLink = { label: string; href: string; external?: boolean };

export const FOOTER_LEGAL_LINKS: readonly LegalLink[] = [
  { label: 'Terms of Service', href: PARENT_COMPANY.termsHref, external: true },
  { label: 'Privacy Policy', href: PARENT_COMPANY.privacyHref, external: true },
  { label: 'Cookies', href: '/cookies' },
  { label: 'AI Policy', href: '/ai-policy' },
];

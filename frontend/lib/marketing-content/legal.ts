/**
 * The contracting entity and the shared model for CiteLadder's legal pages.
 *
 * CiteLadder is a product, not a company. Its policies are CiteLadder's own
 * documents, published on this domain, but the entity every one of them binds
 * is the parent company, Cube27 IT Private Limited. `PARENT_COMPANY` is the one
 * record of that entity; policy text and chrome read it rather than restating
 * a name or an address.
 *
 * Owner-supplied fields that are not yet approved stay empty and are omitted
 * from the rendered pages rather than invented. The open items are tracked in
 * `docs/operations/CiteLadder_Legal_Pages_Final_Review_Draft_2026-09-24.md`.
 */

export const PARENT_COMPANY = {
  name: 'Cube27',
  legalName: 'Cube27 IT Private Limited',
  href: 'https://www.cube27.com/',
  contactHref: 'https://www.cube27.com/contact/',
  address:
    'Plot No. 12, Mulberry Gardens 1, Magarpatta City, Hadapsar, Pune, Maharashtra 411013, India',
  email: 'contact@cube27.com',
} as const;

/**
 * Details the policies need but the owner has not yet approved. An empty
 * string hides the line it would fill; nothing renders a placeholder.
 */
export const LEGAL_ENTITY = {
  registrationNumber: '',
  grievanceContact: '',
  phone: '',
  /** When these documents were last revised. Not a legal effective date. */
  lastUpdated: '2026-09-24',
} as const;

/** "Cube27 IT Private Limited, operating CiteLadder, <address>". */
export const OPERATOR_LINE = `${PARENT_COMPANY.legalName}, operating CiteLadder, ${PARENT_COMPANY.address}`;

type LegalSection = {
  id: string;
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
  note?: string;
  /** A reference table; the first cell of each row is its row header. */
  table?: {
    caption: string;
    headings: readonly string[];
    rows: readonly (readonly string[])[];
  };
};

type LegalSlug =
  | 'terms'
  | 'privacy'
  | 'refund-policy'
  | 'cancellation-policy'
  | 'cookies'
  | 'ai-policy'
  | 'dpa'
  | 'subprocessors'
  | 'contact';

export type LegalDocument = {
  slug: LegalSlug;
  title: string;
  description: string;
  lastUpdated?: string;
  sections: readonly LegalSection[];
};

export type LegalLink = { label: string; href: `/${LegalSlug}` };

/** Every published policy, in footer order. Each has its own marketing route. */
export const FOOTER_LEGAL_LINKS: readonly LegalLink[] = [
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Refund Policy', href: '/refund-policy' },
  { label: 'Cancellation Policy', href: '/cancellation-policy' },
  { label: 'Cookies', href: '/cookies' },
  { label: 'AI Policy', href: '/ai-policy' },
  { label: 'Data Processing Agreement', href: '/dpa' },
  { label: 'Subprocessors', href: '/subprocessors' },
  { label: 'Contact', href: '/contact' },
];

const contact = PARENT_COMPANY.email;

export const COOKIE_POLICY: LegalDocument = {
  slug: 'cookies',
  title: 'Cookie Policy',
  description: 'How CiteLadder uses cookies and similar technologies on the website and platform.',
  sections: [
    {
      id: 'intro',
      title: 'Introduction',
      paragraphs: [
        `This Cookie Policy explains how ${PARENT_COMPANY.legalName} (“Cube27”, “CiteLadder”, “we”, “us”) uses cookies and similar browser storage to operate CiteLadder. Read it with our Privacy Policy at /privacy.`,
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
      table: {
        caption: 'Cookie and browser storage details',
        headings: ['Name', 'Purpose', 'Duration', 'Category'],
        rows: [
          [
            'citeladder_session',
            'Keeps you signed in; contains the protected session token.',
            'Up to 24 hours by default (server setting may differ)',
            'Essential cookie',
          ],
          [
            'citeladder_auth_oauth, citeladder_integration_oauth',
            'Protects a sign-in or integration connection while it completes.',
            'Up to 10 minutes; cleared after completion',
            'Essential cookies',
          ],
          [
            'citeladder.cookie-consent',
            'Remembers your accept or reject choice.',
            'Until you clear site data',
            'Essential local storage',
          ],
          [
            '_ga',
            'Distinguishes visitors for Google Analytics.',
            'Up to 2 years by default',
            'Optional analytics cookie',
          ],
          [
            '_ga_<measurement-id>',
            'Keeps Google Analytics session state.',
            'Up to 2 years by default',
            'Optional analytics cookie',
          ],
        ],
      },
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
        'Google Analytics processes website usage only after you accept optional analytics. An external payment, sign-in or connected-provider page may use its own storage under its own policy.',
      ],
    },
    {
      id: 'changes',
      title: 'Changes',
      paragraphs: [
        'We update this Cookie Policy when the storage we use or its purposes change. The “Last updated” date is revised when we do.',
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      paragraphs: [`Questions: ${contact}.`],
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
        `${PARENT_COMPANY.legalName} operates CiteLadder, an AEO analysis product. We observe how answer engines describe brands and products, persist raw responses as evidence, and score them with deterministic rules.`,
        'This AI Policy summarises how AI systems are involved. It does not replace our Privacy Policy at /privacy or our Terms of Service at /terms.',
      ],
    },
    {
      id: 'how',
      title: 'How AI is used',
      bullets: [
        'Answer engines (ChatGPT, Gemini, Claude, and any others you configure) generate responses when you run audits. Those calls use your BYOK credentials where configured.',
        'Scoring of mentions, citations, and related visibility metrics is deterministic over persisted artifacts — not an LLM judging another model’s answer.',
        'Optional product features may use models for assistance (for example drafting or research helpers). When they do, we will describe the purpose in-product.',
        'A visibility result records what a provider returned for one execution. It does not establish that the answer is true, permanent, or what another user would see.',
      ],
    },
    {
      id: 'not',
      title: 'What we do not do',
      bullets: [
        'We do not sell Customer Data.',
        'We do not use Customer Data to train third-party foundation models.',
        'We do not fabricate scores when evidence is missing — unavailable metrics render as an em dash.',
        'Generation alone never publishes content, makes a purchase from CiteLadder, or changes an external system.',
      ],
    },
    {
      id: 'human',
      title: 'Human oversight',
      paragraphs: [
        'CiteLadder is a measurement and evidence tool for professional teams. Review generated recommendations and drafts before relying on or publishing them. You remain responsible for decisions you make using the outputs. Raw answers and rule versions are available so you can verify scores.',
        'CiteLadder does not guarantee a search ranking, citation, AI recommendation, traffic increase or commercial result. Provider models, data and availability can change independently of CiteLadder.',
        'AI outputs and third-party data are provided as received, for your own evaluation, and are not professional advice. You are responsible for how you, your users and any AI assistant you connect through the API or MCP use them. Cube27 is not liable for decisions, publications or other use based on them, or for their misuse. Our Terms of Service at /terms set out these limits in full.',
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      paragraphs: [`Questions about this Policy: ${contact}.`],
    },
  ],
};

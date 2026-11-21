export const PARENT_COMPANY = {
  name: 'Cube27',
  legalName: 'Cube27 IT Private Limited',
  href: 'https://www.cube27.com/',
  contactHref: 'https://www.cube27.com/contact/',
  address:
    'Plot No. 12, Mulberry Gardens 1, Magarpatta City, Hadapsar, Pune, Maharashtra 411013, India',
  email: 'contact@cube27.com',
} as const;

export const LEGAL_ENTITY = {
  registrationNumber: 'CIN U72900PN2020PTC194984',
  grievanceContact: '',
  phone: '',
} as const;

export const OPERATOR_LINE = `${PARENT_COMPANY.legalName}, operating CiteLadder, ${PARENT_COMPANY.address}`;

type LegalSection = {
  id: string;
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
  note?: string;
  table?: {
    caption: string;
    headings: readonly string[];
    rows: readonly (readonly string[])[];
  };
};

export type LegalDocument = {
  path: `/${string}`;
  metaTitle: string;
  updated: string;
  title: string;
  navLabel?: string;
  description: string;
  sections: readonly LegalSection[];
};

const contact = PARENT_COMPANY.email;

export const COOKIE_POLICY: LegalDocument = {
  path: '/cookies',
  metaTitle: 'Cookie Policy · CiteLadder',
  updated: '2026-10-12',
  title: 'Cookie Policy',
  navLabel: 'Cookies',
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
        'Strictly necessary: session, sign-in transaction, and consent-choice storage needed to provide the service and honour your choice.',
        'Preferences: browser storage remembers settings you choose inside the product, such as your active workspace.',
        'Analytics: when configured, Google Analytics measures website visits only after you accept optional cookies.',
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
  path: '/ai-policy',
  metaTitle: 'AI Policy · CiteLadder',
  updated: '2026-10-12',
  title: 'AI Policy',
  description:
    'How CiteLadder uses AI: answer engines generate responses, scoring is deterministic, and Customer Data is never sold or used to train third-party models.',
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
        'Answer engines (ChatGPT, Gemini and Claude) generate responses when you run audits. Those calls use your BYOK credentials where configured. Google AI Overviews are read from Google search results through DataForSEO, not generated by a model.',
        'Scoring of mentions, citations, and related visibility metrics is deterministic over persisted artifacts, not an LLM judging another model’s answer.',
        'Optional product features may use models for assistance (for example drafting or research helpers). The in-app Agent always uses platform providers (Anthropic or OpenAI), not customer-supplied keys. When a feature uses a model, we will describe the purpose in-product.',
        'Generated prompt suggestions and internal link suggestions are checked by a quality-judging model that answers fixed yes-or-no and multiple-choice questions. It ranks and filters suggestions for your review; it does not write them, publish them, or score your business.',
        'A visibility result records what a provider returned for one execution. It does not establish that the answer is true, permanent, or what another user would see.',
      ],
    },
    {
      id: 'not',
      title: 'What we do not do',
      bullets: [
        'We do not sell Customer Data.',
        'We do not use Customer Data to train third-party foundation models.',
        'We do not fabricate scores when evidence is missing: unavailable metrics render as an em dash.',
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

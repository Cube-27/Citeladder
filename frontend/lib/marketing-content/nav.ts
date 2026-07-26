/**
 * Navigation content for the marketing chrome (desktop dropdowns + the mobile
 * accordions, which render the same tree). Anchors are absolute (`/#platform`)
 * so every row resolves from a subpage, not just from `/`.
 */
export type NavDropKey = 'platform' | 'solutions' | 'resources';

export type NavDropItem =
  | { title: string; desc: string; href: string; external?: boolean }
  | { num: string; title: string; desc: string; href: string };

export type NavDropGroup = { label?: string; items: readonly NavDropItem[] };

export type NavDrop = { key: NavDropKey; label: string; groups: readonly NavDropGroup[] };

export const NAV_DROPS: readonly NavDrop[] = [
  {
    key: 'platform',
    label: 'Platform',
    groups: [
      {
        items: [
          {
            title: 'Market observation',
            desc: 'One run across every major engine',
            href: '/#platform',
          },
          { title: 'Deterministic scoring', desc: 'Same answers, same score', href: '/#platform' },
          {
            title: 'Evidence explorer',
            desc: 'Every metric opens to its source',
            href: '/#evidence',
          },
          {
            title: 'Competitor benchmarking',
            desc: 'Share of answers, engine by engine',
            href: '/#platform',
          },
          {
            title: 'Your own provider keys',
            desc: 'Encrypted at rest, never returned',
            href: '/#evidence',
          },
          { title: 'Cross-run trends', desc: 'Visibility period over period', href: '/#platform' },
        ],
      },
      {
        label: 'How it works',
        items: [
          { num: '01', title: 'Observe', desc: 'Ask what your buyers ask', href: '/#how-it-works' },
          {
            num: '02',
            title: 'Verify',
            desc: 'Trace each answer to evidence',
            href: '/#how-it-works',
          },
          {
            num: '03',
            title: 'Decide',
            desc: 'Turn the pattern into strategy',
            href: '/#how-it-works',
          },
        ],
      },
    ],
  },
  {
    key: 'solutions',
    label: 'Solutions',
    groups: [
      {
        items: [
          {
            title: 'Agencies',
            desc: 'Audits for every client workspace',
            href: '/solutions#agencies',
          },
          {
            title: 'In-house teams',
            desc: 'AI answers beside your rankings',
            href: '/solutions#in-house',
          },
          { title: 'Founders', desc: 'See if engines recommend you', href: '/solutions#founders' },
          {
            title: 'PR & comms',
            desc: 'See what engines say after a launch',
            href: '/solutions#pr',
          },
        ],
      },
    ],
  },
  {
    key: 'resources',
    label: 'Resources',
    groups: [
      {
        items: [
          { title: 'Blog', desc: 'Guides and audit teardowns', href: '/blog' },
          { title: 'FAQ', desc: 'Straight answers on how it works', href: '/faq' },
          { title: 'Compare', desc: 'How Searchify compares', href: '/compare' },
        ],
      },
    ],
  },
];

/** Plain links that sit after the dropdown triggers. */
export const NAV_LINKS = [
  { label: 'Enterprise', href: '/enterprise' },
  { label: 'Pricing', href: '/pricing' },
] as const;

/**
 * The demo-first funnel. Every primary CTA on the surface points here — the
 * enterprise page owns the contact affordance (and its mailto fallback), so
 * there is exactly one place to change when a real demo form exists.
 */
export const DEMO_HREF = '/enterprise#contact';
export const DEMO_CTA = 'Book a demo';

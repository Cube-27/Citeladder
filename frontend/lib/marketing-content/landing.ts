/**
 * Landing-page copy for the public marketing surface.
 *
 * Structure and copy follow the governed product loop. Durable Site, Content,
 * Demand, and Agent capabilities sit behind user-facing loop
 * stations. Sections carry icons and tiles; only the hero tagline, the product
 * visual, and the type scale/weight are ours.
 *
 * Icons and tiles are named here as string keys and resolved to lucide
 * components and token classes in the section files (keeps this a pure data
 * module).
 */

export type IconKey =
  | 'collect'
  | 'analyze'
  | 'improve'
  | 'verify'
  | 'named'
  | 'cited'
  | 'prove'
  | 'compliance'
  | 'sso'
  | 'audit'
  | 'support'
  | 'education'
  | 'commerce'
  | 'services'
  | 'saas'
  | 'media'
  | 'finance';

/** The pastel icon-tile families (globals.css `--color-tile-*`). */
export type TileKey = 'blue' | 'violet' | 'amber' | 'green';

export const LANDING_CONTENT = {
  hook: {
    eyebrow: 'AI visibility software',
    // Retained tagline — the hook the site opens on.
    title: 'Your buyers stopped Googling you.',
    titleAccent: 'They ask AI instead.',
    body: 'See how often AI mentions, cites, or recommends your brand and whether your website supports it. CiteLadder turns AI answers into measurable visibility.',
    primaryCta: 'Book a demo',
    secondaryCta: 'See how it works',
  },

  // NOTE: the prototype's "Trusted by …" logo strip is intentionally omitted —
  // it named fictional customers, and fabricated endorsements must not ship on
  // the real site. Add a real customer/logo strip here when logos exist.

  reveal: {
    kicker: 'What CiteLadder reveals',
    title: 'One record. Three questions.',
    lead: 'CiteLadder separates the facts that AI visibility tools often blur together.',
    questions: [
      {
        icon: 'named' as IconKey,
        tile: 'blue' as TileKey,
        title: 'Are you named?',
        body: 'Measure whether ChatGPT, Gemini, Claude, and Perplexity mention or recommend your brand when buyers ask about your category.',
      },
      {
        icon: 'cited' as IconKey,
        tile: 'violet' as TileKey,
        title: 'What gets cited?',
        body: 'Open the sources behind every answer — your pages, a competitor, editorial coverage, or nothing at all.',
      },
      {
        icon: 'prove' as IconKey,
        tile: 'green' as TileKey,
        title: 'Can your site prove it?',
        body: 'Compare what AI says with what your own pages support, then move the highest-confidence gap into work.',
      },
    ],
  },

  seeIt: {
    kicker: 'The product',
    title: 'From answer to action, without the black box.',
    aside:
      'One workspace for the questions, the answers, the citations, and the fixes — with the evidence attached to every number.',
    link: 'See the product',
    // The workspace canvas is an editorial illustration, not a live view: the
    // share bar and the ledger render aria-hidden, and the marker pill names
    // the workspace illustrative. No measured figure is published here.
    canvas: {
      marker: 'Illustrative workspace',
      range: 'Last 30 days',
      tabs: ['Overview', 'Answers', 'Citations', 'Brands', 'Reports'],
      activeTab: 'Answers',
      share: {
        label: 'Share of citations',
        note: '412 recorded answers · four platforms',
        segments: [
          { key: 'yours', name: 'Your brand', width: 68, label: '68%' },
          { key: 'competitors', name: 'Competitors', width: 22, label: '22%' },
          { key: 'none', name: 'No brand', width: 10, label: '10%' },
        ],
      },
      columns: ['Question', 'Platform', 'Citations', 'Your brand', 'Action'],
      rows: [
        {
          question: 'Best project management tools for startups?',
          snippet: '“Notion, Linear, and ClickUp are top…”',
          platform: 'ChatGPT',
          citations: 5,
          state: 'cited',
        },
        {
          question: 'How does Stripe compare to Adyen?',
          snippet: '“Stripe is easier to integrate and o…”',
          platform: 'Claude',
          citations: 4,
          state: 'not',
        },
        {
          question: 'What is revenue intelligence?',
          snippet: '“Revenue intelligence is a way to…”',
          platform: 'Perplexity',
          citations: 6,
          state: 'cited',
        },
        {
          question: 'Top AI visibility platforms for enterprise?',
          snippet: '“CiteLadder leads for source-level trac…”',
          platform: 'Gemini',
          citations: 7,
          state: 'cited',
        },
      ],
    },
  },

  workflow: {
    kicker: 'The operating loop',
    title: 'A continuous cycle for stronger AI visibility.',
    lead: 'From tracking answers to taking action, CiteLadder turns AI insights into measurable progress — week after week.',
    steps: [
      {
        stage: 'Collect',
        icon: 'collect' as IconKey,
        tile: 'blue' as TileKey,
        label: 'Track AI answers',
        desc: 'Capture what AI says about your brand, competitors, and category — across all major platforms.',
      },
      {
        stage: 'Prioritize',
        icon: 'analyze' as IconKey,
        tile: 'violet' as TileKey,
        label: 'Find the opportunities',
        desc: 'Surface gaps, mixed messages, and high-value topics where your brand can win.',
      },
      {
        stage: 'Improve',
        icon: 'improve' as IconKey,
        tile: 'amber' as TileKey,
        label: 'Take action',
        desc: 'Create and update content, sharpen positioning, and influence what AI cites.',
      },
      {
        stage: 'Verify',
        icon: 'verify' as IconKey,
        tile: 'green' as TileKey,
        label: 'Measure progress',
        desc: 'Track changes over time and validate that your brand shows up more often — and more accurately.',
      },
    ],
  },

  packs: {
    kicker: 'Use cases',
    title: 'Built around how your industry actually works.',
    lead: 'Buyers research differently across sectors. Measuring AI visibility shows where models recommend your brand, where competitors take the lead, and whether your website provides the proof.',
    items: [
      {
        icon: 'education' as IconKey,
        name: 'Education',
        benefit:
          'Track whether AI models recommend your programs when students research degree and certificate options, and verify that answer engines quote accurate tuition, admissions, and faculty credentials.',
      },
      {
        icon: 'commerce' as IconKey,
        name: 'Commerce',
        benefit:
          'Discover when AI shopping assistants recommend your products over rivals, and ensure engines pull accurate pricing, availability, and specifications directly from your store.',
      },
      {
        icon: 'services' as IconKey,
        name: 'Professional services',
        benefit:
          'See how AI positions your practice areas and partners when prospects research advisory firms, ensuring your case studies and subject-matter expertise get cited as authoritative sources.',
      },
      {
        icon: 'saas' as IconKey,
        name: 'Enterprise SaaS',
        benefit:
          'Measure how often your software appears in AI-generated buyer shortlists, identify where competitors get recommended instead, and ensure models rely on your official features and pricing.',
      },
      {
        icon: 'media' as IconKey,
        name: 'Media & publishing',
        benefit:
          'Monitor how frequently AI engines cite your original reporting and research, protect your editorial attribution, and ensure models reference current coverage rather than outdated stories.',
      },
      {
        icon: 'finance' as IconKey,
        name: 'Financial services',
        benefit:
          'Verify that AI models accurately explain your financial products, rates, and advisory services while citing compliance disclosures correctly to safeguard trust and brand reputation.',
      },
    ],
  },

  trust: {
    kicker: 'For enterprise teams',
    title: 'Enterprise credibility is a product behavior.',
    // Keep this claim to what the product actually does. No named or implied
    // customers until real logos exist (see the note above `reveal`), and the
    // key-handling wording tracks the BYOK answer in `faq.ts`.
    who: 'Model calls run on your own provider keys, billed at your provider’s rates and never marked up. Provider secrets are encrypted at rest, resolved only at execution time, and never returned, logged, or placed in a prompt.',
    guarantees: [
      {
        icon: 'compliance' as IconKey,
        tile: 'blue' as TileKey,
        title: 'Your keys, your model spend',
        description: 'Provider secrets are encrypted at rest and resolved only at execution time.',
      },
      {
        icon: 'sso' as IconKey,
        tile: 'blue' as TileKey,
        title: 'Project-scoped access',
        description: 'Workspaces keep each project’s crawls, prompts, and answers separate.',
      },
      {
        icon: 'audit' as IconKey,
        tile: 'blue' as TileKey,
        title: 'Audit trail and exportable reports',
        description: 'Every run, answer, and change is persisted and inspectable.',
      },
      {
        icon: 'support' as IconKey,
        tile: 'blue' as TileKey,
        title: 'Dedicated support and success',
        description: 'Onboarding, prompt-portfolio reviews, and quarterly health checks.',
      },
    ],
  },

  cta: {
    kicker: 'Get started',
    title: 'Grow on evidence, not assumptions.',
    body: 'A working session on your category, your competitors, and the gaps buyers already see in AI answers.',
    primaryCta: 'Book a demo',
    secondaryCta: 'See pricing',
  },
} as const;

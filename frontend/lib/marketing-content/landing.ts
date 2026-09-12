/** Public landing copy. Presentation belongs to the section and shared role owners. */

export const LANDING_CONTENT = {
  hook: {
    eyebrow: 'AI visibility software',
    // Retained tagline — the hook the site opens on.
    title: 'Your buyers stopped Googling you.',
    titleAccent: 'They ask AI instead.',
    body: 'See how often AI mentions, cites, or recommends your brand and whether your website supports it. CiteLadder turns AI answers into measurable visibility.',
    primaryCta: 'Start Free Trial',
    secondaryCta: 'Book a demo',
  },

  // NOTE: the prototype's "Trusted by …" logo strip is intentionally omitted —
  // it named fictional customers, and fabricated endorsements must not ship on
  // the real site. Add a real customer/logo strip here when logos exist.

  reveal: {
    kicker: 'What CiteLadder reveals',
    title: 'See how AI sees your brand.',
    lead: 'CiteLadder separates the facts that AI visibility tools often blur together.',
    questions: [
      {
        title: 'Are you named?',
        body: 'Measure whether ChatGPT, Gemini, Claude, and Perplexity mention or recommend your brand when buyers ask about your category.',
      },
      {
        title: 'What gets cited?',
        body: 'Open the sources behind every answer — your pages, a competitor, editorial coverage, or nothing at all.',
      },
      {
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
    // share bar and the ledger render aria-hidden. No measured figure is
    // published here.
    canvas: {
      contextLabel: 'Illustrative workspace',
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
        label: 'Track AI answers',
        desc: 'Capture what AI says about your brand, competitors, and category — across all major platforms.',
      },
      {
        stage: 'Prioritize',
        label: 'Find the opportunities',
        desc: 'Surface gaps, mixed messages, and high-value topics where your brand can win.',
      },
      {
        stage: 'Improve',
        label: 'Take action',
        desc: 'Create and update content, sharpen positioning, and influence what AI cites.',
      },
      {
        stage: 'Verify',
        label: 'Measure progress',
        desc: 'Track changes over time and validate that your brand shows up more often — and more accurately.',
      },
    ],
  },

  packs: {
    kicker: 'Use cases',
    title: 'Built around how your industry actually works.',
    lead: 'Buyers research differently across sectors. CiteLadder shows where AI recommends you, where rivals take the lead, and whether your site backs the claim.',
    items: [
      {
        name: 'Education',
        benefit: 'Programs, admissions, and tuition facts, quoted accurately.',
      },
      {
        name: 'Commerce',
        benefit: 'Product recommendations, prices, and availability in AI answers.',
      },
      {
        name: 'Professional services',
        benefit: 'How AI positions your practice areas and expertise.',
      },
      {
        name: 'Enterprise SaaS',
        benefit: 'Your share of AI-generated buyer shortlists.',
      },
      {
        name: 'Media & publishing',
        benefit: 'Attribution for original reporting and research.',
      },
      {
        name: 'Financial services',
        benefit: 'Product, rate, and compliance explanations that hold up.',
      },
    ],
  },

  trust: {
    kicker: 'For enterprise teams',
    title: 'Enterprise credibility is a product behavior.',
    who: 'Leading companies use CiteLadder to make AI visibility a repeatable, measurable part of their go-to-market motion — from brand and product to demand and communications.',
    guarantees: [
      {
        title: 'Security & compliance ready',
        description: 'Workspace isolation, encrypted provider secrets, and scoped project access.',
      },
      {
        title: 'Advanced permissions and SSO',
        description: 'Roles and project-scoped access across your workspace.',
      },
      {
        title: 'Audit trail and exportable reports',
        description: 'Every run, answer, and change is persisted and inspectable.',
      },
      {
        title: 'Dedicated support and success',
        description: 'Onboarding, prompt-portfolio reviews, and health checks, scoped by contract.',
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

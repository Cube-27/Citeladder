/**
 * Landing-page copy for the public marketing surface.
 *
 * Structure and copy follow the governed product loop. Durable Site, Content,
 * Demand, and Agent capabilities sit behind user-facing loop
 * stations. Sections carry icons and the prototype's fuller detail (a four-step
 * loop, use-case item lists, and a security ledger). Only the hero tagline, the
 * product visual, and the type scale/weight are ours.
 *
 * Icons are named here as string keys and resolved to lucide components in the
 * section files (keeps this a pure data module).
 */

export type IconKey =
  | 'collect'
  | 'analyze'
  | 'improve'
  | 'verify'
  | 'education'
  | 'commerce'
  | 'services'
  | 'saas'
  | 'media'
  | 'finance'
  | 'isolation'
  | 'provenance'
  | 'correction'
  | 'versioned'
  | 'ask'
  | 'prove'
  | 'see';

export const LANDING_CONTENT = {
  hook: {
    eyebrow: 'AI visibility software',
    // Retained tagline — the hook the site opens on.
    title: 'Your buyers stopped Googling you.',
    titleAccent: 'They ask AI instead.',
    body: 'AI visibility is whether ChatGPT, Gemini, or Claude names you, cites you, or recommends a rival when someone asks about your category. CiteLadder records those answers, pairs them with what your site actually proves, and shows mention share, citation share, and coverage as separate facts. You bring the provider keys. We do not claim a page change caused a ranking.',
    primaryCta: 'Book a demo',
    secondaryCta: 'See how it works',
  },

  // NOTE: the prototype's "Trusted by …" logo strip is intentionally omitted —
  // it named fictional customers, and fabricated endorsements must not ship on
  // the real site. Add a real customer/logo strip here when logos exist.

  shift: {
    kicker: 'The shift',
    title: 'Growth stopped being a guessing game.',
    facts: [
      {
        icon: 'ask' as IconKey,
        label: 'Ask',
        title: 'Buyers ask before they browse.',
        body: 'Shortlists now start inside an answer engine, and they often end there.',
      },
      {
        icon: 'prove' as IconKey,
        label: 'Prove',
        title: 'Answers cite evidence, not opinions.',
        body: 'Either your pages prove the claim an engine needs, or a competitor’s pages do.',
      },
      {
        icon: 'see' as IconKey,
        label: 'See',
        title: 'You can’t fix what you can’t see.',
        body: 'Scattered tools hide the gap. One record makes mention, citation, and coverage measurable.',
      },
    ],
  },

  seeIt: {
    kicker: 'The product',
    title: 'The whole system, in one workspace.',
    cta: 'Run this on your market',
  },

  workflow: {
    kicker: 'How it works',
    title: 'Evidence to improvement, in a closed loop.',
    lead: 'Each pass collects evidence, ranks the next gap, waits for you to save a change, then recrawls or reruns the same prompts so you can see what the engines said afterwards.',
    steps: [
      {
        num: '01',
        icon: 'collect' as IconKey,
        label: 'Collect evidence',
        desc: 'Crawl pages, ingest Search Console and GA4, and persist engine answers. Every artifact stays versioned so a later score can open the source.',
      },
      {
        num: '02',
        icon: 'analyze' as IconKey,
        label: 'Analyze and prioritize',
        desc: 'Apply deterministic checks. Score gaps by evidence strength, not by a model grading another model. Rank the queue your team will actually work.',
      },
      {
        num: '03',
        icon: 'improve' as IconKey,
        label: 'Improve content',
        desc: 'Turn a gap into a brief, draft, schema, or FAQ. Claims the draft cannot support from your facts are flagged. Saving is your decision.',
      },
      {
        num: '04',
        icon: 'verify' as IconKey,
        label: 'Measure and verify',
        desc: 'Recrawl after publication and rerun the same prompt set. The report describes what was observed. It does not claim the change caused a ranking.',
      },
    ],
  },

  packs: {
    kicker: 'Use cases',
    title: 'Built around how your industry actually works.',
    lead: 'The same loop classifies pages by job (program, product, article, bio) and applies checks that fit that job. Industry here is context, not a separate product.',
    items: [
      {
        icon: 'education' as IconKey,
        name: 'Education',
        points: [
          'Program and course pages with visible facts engines can quote',
          'Accreditation and faculty entities named on the page',
          'Student FAQ gaps against questions people already ask',
          'Admissions and fees pages treated as their own page kinds',
        ],
      },
      {
        icon: 'commerce' as IconKey,
        name: 'Commerce',
        points: [
          'Product detail completeness: name, price, availability, spec',
          'Category pages that explain the set, not only a grid',
          'Support FAQ coverage for shopping-assistant questions',
          'Price and SKU accuracy against the catalog you connect',
        ],
      },
      {
        icon: 'services' as IconKey,
        name: 'Professional services',
        points: [
          'Service pages classified by role, not by leftover schema',
          'Case studies with proof a reviewer can open',
          'Expert biographies with credentials in visible copy',
          'Trust signals that match what the firm can actually show',
        ],
      },
      {
        icon: 'saas' as IconKey,
        name: 'Enterprise SaaS',
        points: [
          'Landing and pricing pages with claims the product supports',
          'Docs coverage for questions technical buyers ask engines',
          'Changelog and release-note gaps after a ship',
          'Integration pages that name the systems you actually connect',
        ],
      },
      {
        icon: 'media' as IconKey,
        name: 'Media & publishing',
        points: [
          'Article and author markup that matches visible bylines',
          'Explainer and FAQ gaps in the editorial set',
          'Citation and summary visibility for flagship stories',
          'Freshness when an engine is still quoting last year’s piece',
        ],
      },
      {
        icon: 'finance' as IconKey,
        name: 'Financial services',
        points: [
          'Disclosure completeness on product and advice pages',
          'Advisor profile and credential gaps',
          'Review and trust-signal coverage that stays inspectable',
          'Product assertions checked against source facts, not slogans',
        ],
      },
    ],
  },

  trust: {
    kicker: 'Enterprise-grade',
    title: 'Built for regulated and security-conscious enterprises.',
    lead: 'CiteLadder is a Cube27 product. Cube27 IT Pvt. Ltd. is based in Magarpatta City, Pune. Product is led by Abhineet Jain. Arpan Jain is Founder and CEO. The record stays inspectable from the first crawl to the latest recommendation.',
    who: 'Keys stay in your provider account. Workspaces do not share facts. New observations append. You save content and you start an audit. We do not publish for you.',
    guarantees: [
      {
        icon: 'isolation' as IconKey,
        title: 'Data isolation',
        description: 'Every customer fact stays project-scoped and never crosses workspaces.',
      },
      {
        icon: 'provenance' as IconKey,
        title: 'Full provenance',
        description: 'Every recommendation links to the typed evidence chain behind it.',
      },
      {
        icon: 'correction' as IconKey,
        // NOT "durable corrections": EditableFact has no production caller and
        // no persistence path yet, and the site does not advertise capability
        // the product cannot keep (§9.1). Restore the stronger claim when
        // corrections are wired to a durable mutation.
        title: 'No silent rewrites',
        description: 'New observations append to the record instead of replacing earlier evidence.',
      },
      {
        icon: 'versioned' as IconKey,
        title: 'Versioned analysis',
        description:
          'Classifiers, rules, formulas, and source evidence stay versioned and inspectable.',
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

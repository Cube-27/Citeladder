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
    body: 'See how often AI mentions, cites, or recommends your brand and whether your website supports it. CiteLadder turns AI answers into measurable visibility.',
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
    kicker: 'Enterprise-grade',
    title: 'Built for regulated and security-conscious enterprises.',
    // "Keys stay in your provider account" read as though the key never
    // reaches us, which contradicts the FAQ (encrypted at rest, resolved only
    // at execution time). Usage and billing stay with the provider; the key
    // itself is stored here, encrypted. A security claim has to match.
    who: 'Your provider account keeps the usage and the billing; the key you supply is encrypted at rest and resolved only when a run needs it. Workspaces do not share facts. New observations append. You save content and you start an audit. We do not publish for you.',
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

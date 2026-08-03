/**
 * Blog content for /blog and /blog/[slug].
 *
 * Posts render straight from this module. Every claim in a post body must be
 * grounded in this repository — no invented numbers, customer results, or
 * dates. The owner-supplied byline fields (`date`, `readTime`, `author`) are
 * optional: while they are absent the byline row is omitted entirely rather
 * than showing a placeholder (owner blocker B5).
 */

export type BlogBlock =
  { type: 'paragraph' | 'heading'; text: string } | { type: 'list'; items: readonly string[] };

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  /** Owner-supplied. Byline row is omitted entirely while absent. */
  date?: string;
  /** Owner-supplied. */
  readTime?: string;
  /** Owner-supplied. */
  author?: string;
  tags: readonly string[];
  body: readonly BlogBlock[];
};

export const POSTS: readonly BlogPost[] = [
  {
    slug: 'how-we-measure-ai-visibility-deterministically',
    title: 'How we measure AI visibility deterministically',
    excerpt:
      'Most AI-visibility numbers come from one model grading another. Ours come from ' +
      'persisted responses, alias matching and a versioned rule set — so the same evidence ' +
      'always produces the same score, and you can check it.',
    tags: ['Method', 'Evidence'],
    body: [
      {
        type: 'paragraph',
        text:
          'Most AI-visibility tools hand you a number and ask you to trust it. The number ' +
          'came from somewhere — a model reading other models’ answers and grading them, a ' +
          'spreadsheet nobody versioned, a demo that ran once. If you cannot recompute a ' +
          'score from the evidence behind it, the score is an opinion. This post covers the ' +
          'commitments that keep our numbers out of that category: no model grades another, ' +
          'every number carries the version of the code that produced it, and you can read ' +
          'every rule.',
      },
      { type: 'heading', text: 'No model grades another.' },
      {
        type: 'paragraph',
        text:
          'Mentions, citations, domain matching and share of voice are computed by ' +
          'alias-based matching over the persisted response text, not by an LLM judge. When ' +
          'an audit runs, the raw answer from each engine is stored as an artifact first; ' +
          'every headline metric is then derived from that text by explicit, versioned ' +
          'rules. The same evidence always produces the same score, and every classification ' +
          'in the UI and the exports can be explained by pointing at the text that ' +
          'triggered it.',
      },
      { type: 'heading', text: 'Every number carries the version that produced it.' },
      {
        type: 'paragraph',
        text:
          'Each derived projection is stamped with the analyzer and rule version that wrote ' +
          'it, so a score change can be attributed to a data change or a code change. When a ' +
          'number moves between runs, the stamps tell you whether the engines answered ' +
          'differently or the rules did — the two cases a reader most needs to tell apart. ' +
          'The stamps currently riding on production numbers:',
      },
      {
        type: 'list',
        items: [
          'scoring-v1 — visibility scoring rules',
          'b6-analysis-1 — the response analyzer',
          'sh-rules-2 — the site-health rule catalog',
          'product-scoring-v2 — product/commerce scoring',
          'opp-formula-1 — opportunity prioritisation',
          'traffic-formula-1 — the traffic projection',
        ],
      },
      { type: 'heading', text: 'Thirty-three rules, and you can read all of them.' },
      {
        type: 'paragraph',
        text:
          'The site-health catalog is 33 deterministic rules in 8 categories — indexability, ' +
          'content, metadata, structured data, citability, performance, security and links. ' +
          'Web Fundamentals and AEO are weighted 50/50 into the combined score, each rule outcome ' +
          'is inspectable per page, and a missing or failed score renders as an em dash ' +
          'rather than a fabricated zero.',
      },
      { type: 'heading', text: 'Three engines, one approved route each.' },
      {
        type: 'paragraph',
        text:
          'We audit ChatGPT, Gemini and Claude — no more. Each engine runs through exactly ' +
          'one approved transport, and every run records all three identities: the logical ' +
          'engine you asked for, the transport provider the request went through, and the ' +
          'exact transport model that produced the answer. Naming an engine we do not audit ' +
          'would break the site’s own published rule: never claim coverage of engines we do ' +
          'not audit.',
      },
      { type: 'heading', text: 'Your keys, not ours.' },
      {
        type: 'paragraph',
        text:
          'Audits run on your workspace’s own provider keys. Keys are Fernet-encrypted at ' +
          'rest, resolved only at execution time, and never returned by the API — so model ' +
          'usage bills to your own provider accounts at provider rates, and the secrets ' +
          'never pass through our responses.',
      },
      {
        type: 'paragraph',
        text:
          'What this buys you is a number you can re-derive. Open any score and you are one ' +
          'click from the persisted answer it came from, the rule version that scored it, ' +
          'and the run that produced both. If we ever ask you to trust a number we cannot ' +
          'show the working for, treat it with the same suspicion you would bring to anyone ' +
          'else’s.',
      },
    ],
  },
];

export type BlogEmptyState = {
  heading: string;
  body: string;
};

/** Shown on /blog when POSTS is empty. */
export const BLOG_EMPTY_STATE: BlogEmptyState = {
  heading: 'First posts are on the way.',
  body:
    'We’re writing about AEO, evidence-first scoring, and how teams measure AI visibility. ' +
    'Until then, the best way to follow along is to register and try the product yourself.',
};

/**
 * Blog content for /blog and /blog/[slug].
 *
 * Posts render straight from this module. Every claim must be grounded in this
 * repository. Owner-supplied byline fields (`date`, `readTime`, `author`) are
 * optional: while absent the byline is omitted rather than showing a placeholder.
 *
 * Copy rule: buyer-facing commitments only. No internal version ids, rule
 * counts, or formula names. Headings must not contain the product name.
 */

import { CONTENT_REVIEWED, PRODUCT_HEAD } from './people';

export type BlogBlock =
  | { type: 'paragraph' | 'heading'; text: string }
  | { type: 'list'; items: readonly string[] };

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date?: string;
  dateModified?: string;
  readTime?: string;
  author?: string;
  authorRole?: string;
  authorUrl?: string;
  tags: readonly string[];
  body: readonly BlogBlock[];
};

function paragraph(text: string): BlogBlock {
  return { type: 'paragraph', text };
}

function heading(text: string): BlogBlock {
  return { type: 'heading', text };
}

function bulletList(...items: readonly string[]): BlogBlock {
  return { type: 'list', items };
}

type BlogSection = readonly [title: string, content: string | readonly string[]];

function outlinedArticle(intro: string, ...sections: readonly BlogSection[]): readonly BlogBlock[] {
  return [
    paragraph(intro),
    ...sections.flatMap(([title, content]) => [
      heading(title),
      typeof content === 'string' ? paragraph(content) : bulletList(...content),
    ]),
  ];
}

/**
 * The shared byline. `dateModified` tracks the content review — that is what a
 * review pass legitimately changes for every post at once.
 *
 * `date` (the publication date) is deliberately NOT here. It belongs to the
 * post, not to the review: sharing `CONTENT_REVIEWED` between the two meant
 * that bumping the review date silently rewrote `datePublished` for the whole
 * archive, so every guide would claim to have been published on the day of the
 * most recent edit. Each entry states its own, beside `readTime`.
 */
const BYLINE = {
  dateModified: CONTENT_REVIEWED,
  author: PRODUCT_HEAD.name,
  authorRole: PRODUCT_HEAD.role,
  authorUrl: PRODUCT_HEAD.linkedin,
} as const;

/** First publication of the guide set. Only a new post changes this. */
const PUBLISHED = '2026-09-03';

export const POSTS: readonly BlogPost[] = [
  {
    slug: 'how-we-measure-ai-visibility-deterministically',
    title: 'How to measure AI visibility with evidence you can audit',
    excerpt:
      'AI visibility is an observation of an answer, not a ranking position. Persist the response, apply explicit rules, show coverage, and keep every score tied to the evidence that produced it.',
    ...BYLINE,
    date: PUBLISHED,
    readTime: '9 min',
    tags: ['AI visibility', 'Measurement'],
    body: outlinedArticle(
      'AI visibility is not a single ranking. It is what an answer engine says when a defined audience asks a defined question. If you cannot open the prompt, the engine, the response, and the rule that interpreted it, you do not have a measurement. You have a vibe.',
      [
        'Start with the answer, not a verdict',
        'The raw response is the primary evidence. Mentions, citations, recommendation presence, and observed share are derived from that persisted artifact with explicit rules. A model does not grade another model to create the headline number. If a teammate cannot read the answer behind a 42 percent figure, the figure is not ready for a board slide.',
      ],
      [
        'A worked example without pretending it is your market',
        [
          'Fix a prompt set of 50 questions your buyers actually ask.',
          'Run the same 50 across ChatGPT, Gemini, and Claude on the same day.',
          'If your brand is named in 15 of those 50 answers, presence is 30 percent on that set, not “the internet.”',
          'If 8 of those 15 also link your domain, citation is a different count than mention.',
          'If 10 prompts failed because a key was missing, that is unavailable, not a zero.',
        ],
      ],
      [
        'Make the measurement reproducible',
        'A comparable run freezes the prompt portfolio, engine selection, and relevant analysis versions. When the result moves, the audit trail lets you separate a changed answer from a changed interpretation. That is the difference between “we got worse” and “we changed the question.”',
      ],
      [
        'Treat coverage as part of the result',
        'A percentage without its denominator invites false confidence. Observed zero, unavailable, not configured, and incomplete coverage are distinct. A team can tell what was measured and what still needs evidence. Collapsing those into a blank chart is how AI reports lose trust in the second meeting.',
      ],
      [
        'What this is not',
        'This is not proof that a blog post caused a ranking, a click, or a deal. Pew Research Center has documented that people click traditional results less often when an AI summary sits on the page. That is a reason to measure answers. It is not a license to invent a pipeline number. Pair answer evidence with site health and demand signals. Later audits report what was observed after a change. They do not claim the change caused it.',
      ],
      [
        'The standard we hold ourselves to',
        'A number is useful when a teammate can open it, inspect the answer behind it, understand its coverage, and explain how it was derived. That is the measurement contract. If a vendor will not show you the answer, do not argue about their methodology. Ask for the artifact.',
      ],
    ),
  },
  {
    slug: 'a-practical-aeo-audit-from-crawl-to-citation',
    title: 'A practical AEO audit: from crawl to citation evidence',
    excerpt:
      'Answer-engine optimization starts before a prompt is run. If important pages are hard to discover or unsupported by visible facts, a citation report cannot tell you what to fix first.',
    ...BYLINE,
    date: PUBLISHED,
    readTime: '10 min',
    tags: ['AEO', 'Field guide'],
    body: outlinedArticle(
      'Answer engine optimization is the practice of making your pages easier for ChatGPT, Gemini, Claude, and similar systems to find, understand, and cite. It builds on SEO. It does not replace crawl access, clear headings, or consistent facts. It adds a second question: when someone asks, does the engine use you?',
      [
        'What an AEO audit is for',
        'The audit is a sequence, not a dashboard screenshot. First you know which pages you own and what they prove. Then you know which questions matter. Only then does a citation report tell you which gap to work. If you skip the first two, you will rewrite the homepage because a competitor was named once.',
      ],
      [
        'Establish the pages and facts you own',
        'Begin with a bounded crawl of the owned site. Record the fetched artifact, normalize the page facts, and classify each supported page by its structural purpose: product, article, FAQ, organization, program, and so on. A page without enough evidence stays unclassified rather than being forced into a generic verdict. Structured data can support that classification. It cannot certify the schema being checked.',
      ],
      [
        'Apply checks that fit the page',
        'A product page, an article, an FAQ, and an organization page do not have the same job. Page-kind checks should test the signals that matter for that job: visible headings and content, links, metadata, delivery, and structured data. Answer-first copy helps. A 40 word definition near the top of a page is easier to extract than a metaphor buried under a product video. That is a writing choice, not a ranking hack.',
      ],
      [
        'Turn demand into a prompt portfolio',
        'Use search and journey evidence to define the questions your audience actually asks. Keep the portfolio explicit. Each prompt has an intent, an audience, and a reason it belongs in the measurement. This makes later runs comparable instead of turning them into a random sample of whatever someone typed into ChatGPT that morning.',
      ],
      [
        'The loop after the first crawl',
        [
          'Connect owned pages, demand sources, and approved provider routes.',
          'Analyze structural gaps and answer-engine responses against the same project context.',
          'Prioritize an opportunity with its evidence, scope, and suggested content handoff.',
          'After publication, recrawl or rerun the same cohort and report the observation.',
        ],
      ],
      [
        'Read citations as observations',
        'A citation shows that a source appeared in a particular response under particular conditions. It does not prove that the source caused a ranking, traffic, or revenue result. Keep that distinction visible when you share an AEO report. Competitors in this category often lead with share of voice. Share of voice is useful. It is still an observation on a prompt set you chose.',
      ],
      [
        'Who this is for',
        'Use this sequence if you run SEO, content, or brand and you have been asked “are we in ChatGPT?” If you need a 26 minute category essay, start with the definition above, then run the crawl. Do not wait for a perfect knowledge graph. Start with the pages you control and the questions you can defend.',
      ],
    ),
  },
  {
    slug: 'why-ai-visibility-scores-need-provenance',
    title: 'Why AI visibility scores need provenance',
    excerpt:
      'The fastest way to lose trust in an AI report is to hide the answer, the coverage, or the rule behind the score. Here is the audit trail a useful metric needs.',
    ...BYLINE,
    date: PUBLISHED,
    readTime: '8 min',
    tags: ['Evidence', 'Governance'],
    body: outlinedArticle(
      'Visibility reports are often presented as polished percentages. The hard question comes next: what exactly did the engine answer, which source was cited, and why did this row count? Provenance makes those questions answerable without asking a teammate to trust a dashboard.',
      [
        'What a defensible score carries',
        [
          'The prompt and project context used for the observation.',
          'The persisted answer and provider attempt that supplied the evidence.',
          'The deterministic analysis and rule versions that produced the derived fields.',
          'The coverage, limitations, and comparison boundary for the aggregate.',
        ],
      ],
      [
        'Versioning protects the meaning of change',
        'When a score changes, there are several possible explanations: the engine answered differently, the prompt changed, the measured cohort changed, or an analysis rule changed. Persisted source and version references let an analyst tell those cases apart. Without that, every dip becomes a content emergency and every rise becomes a victory lap.',
      ],
      [
        'Unknown is better than a made-up zero',
        'A provider outage, missing configuration, or partial crawl is not the same as an observed zero. A trustworthy report names the state it has and leaves an unmeasured result unqualified. That is more useful for decisions and more honest in an executive review. Security reviewers notice this immediately. Growth teams notice it the second time the number jumps for no stated reason.',
      ],
      [
        'Make the trail useful to the next person',
        'The goal is not to expose implementation detail for its own sake. It is to let a marketer, analyst, or security reviewer move from a finding to its source, understand the boundary, and decide what to do next without rebuilding the run from memory. If only the person who configured the tool can explain a row, the measurement does not survive vacation.',
      ],
      [
        'How we use this in practice',
        'We persist the answer before we score it. We stamp analysis versions on derived rows. We refuse to render a conclusion that has no resolvable source. That is slower than a nightly black-box grade. It is also the only way we would sign a number in a procurement packet.',
      ],
    ),
  },
  {
    slug: 'byok-ai-visibility-measurement-explained',
    title: 'BYOK AI visibility measurement, explained',
    excerpt:
      'Bring-your-own-key changes the credential and billing boundary. It does not change the measurement contract. Prompts, responses, and derived results still belong to the workspace.',
    ...BYLINE,
    date: PUBLISHED,
    readTime: '7 min',
    tags: ['Operations', 'BYOK'],
    body: outlinedArticle(
      'Bring-your-own-key (BYOK) means the provider account used for an audit belongs to your team. You pay OpenAI, Google, or Anthropic at their rates. The platform never marks that usage up. It also never pretends a hosted key is the same privacy story.',
      [
        'What stays in your control',
        [
          'Provider account and usage billing remain with your provider.',
          'Credentials are encrypted at rest and resolved only when execution needs them.',
          'Keys are not returned in API responses or logged in clear text.',
          'You choose when an audit or schedule runs because provider calls have a cost.',
        ],
      ],
      [
        'What the platform records',
        'A run records the approved engine route, prompt context, provider attempt, and response evidence needed to explain the result. The supported direct answer-engine routes are ChatGPT, Gemini, and Claude. Availability still depends on the provider configuration and the limits of the account you connect. If Claude is not configured, that engine is unavailable. It is not scored as a silent zero.',
      ],
      [
        'Why the boundary matters',
        'Keeping provider credentials separate from derived evidence makes both sides clearer. Your team controls the account and the run decision. The workspace retains the evidence trail needed to compare observations, inspect citations, and choose the next action. Procurement teams can map that split in a review. Growth teams can still open the answer.',
      ],
      [
        'What BYOK does not buy you',
        'Your own keys do not make a bad prompt set scientific. They do not make a thin page citable. They do not prove causality after you publish. They do change who can see the secret, who pays the token bill, and whether a vendor can train on your runs. Ask those three questions of any AI visibility tool, including us.',
      ],
    ),
  },
];

export type BlogEmptyState = {
  heading: string;
  body: string;
};

/** Shown on /blog when POSTS is empty. */
export const BLOG_EMPTY_STATE: BlogEmptyState = {
  heading: 'First posts are on the way.',
  body: 'Notes on AEO and evidence-first measurement. Until then, try the product.',
};

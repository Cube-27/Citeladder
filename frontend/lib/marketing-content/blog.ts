import { POST_AUDIT } from './blog-posts/audit';
import { POST_CONNECT } from './blog-posts/connect';
import { POST_PLAYBOOK } from './blog-posts/playbook';
import { POST_TRACK } from './blog-posts/track';
import { POST_VERIFY } from './blog-posts/verify';

/**
 * Editorial content for `/blog` and `/blog/[slug]`.
 *
 * Posts render straight from this module. Every claim must be grounded in this
 * repository or in a source the post names: no unattributable benchmark
 * figures, no invented percentages. Owner-supplied byline fields (`date`,
 * `readTime`, `author`) are optional — while absent the byline is omitted
 * rather than showing a placeholder — and the author identity comes from
 * `./people` so a byline, the Organization JSON-LD, and llms.txt cannot drift
 * apart.
 */

/**
 * Diagram payloads are a discriminated union, not a `Record<string, unknown>`.
 * The loose shape let a post author write `children` where the renderer read
 * `nodes`: the block still type-checked, still rendered its frame, and quietly
 * dropped every row inside it. Naming the payload per variant makes that a
 * compile error instead of a blank box on a published page.
 */
type DiagramSource = { title: string; badge: string; description: string };
type DiagramFlowStep = { step: string; title: string; desc: string };
type DiagramTaxonomyNode = { category: string; intent: string; details: string };

export type BlogDiagram =
  | {
      variant: 'architecture';
      data: {
        sources: readonly DiagramSource[];
        destination?: { title: string; description: string };
      };
    }
  | {
      variant: 'split';
      data: {
        leftTitle: string;
        leftBadge: string;
        leftItems: readonly string[];
        rightTitle: string;
        rightBadge: string;
        rightItems: readonly string[];
      };
    }
  | { variant: 'flow'; data: { steps: readonly DiagramFlowStep[] } }
  | { variant: 'taxonomy'; data: { root: string; nodes: readonly DiagramTaxonomyNode[] } };

export type BlogBlock =
  | { type: 'heading'; text: string }
  | { type: 'subheading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: readonly string[]; ordered?: boolean }
  | {
      type: 'table';
      headers: readonly string[];
      rows: readonly (readonly string[])[];
      caption?: string;
      heatmap?: boolean;
    }
  | {
      type: 'checklist';
      title?: string;
      items: readonly { title: string; description: string; badge?: string }[];
    }
  | ({ type: 'diagram'; title?: string } & BlogDiagram)
  | {
      type: 'callout';
      title?: string;
      text: string;
      tone?: 'accent' | 'warning' | 'info';
    };

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  date?: string;
  dateModified?: string;
  readTime?: string;
  author?: string;
  authorRole?: string;
  authorUrl?: string;
  tags: readonly string[];
  body: readonly BlogBlock[];
};

export const POSTS: readonly BlogPost[] = [
  POST_CONNECT,
  POST_AUDIT,
  POST_PLAYBOOK,
  POST_VERIFY,
  POST_TRACK,
] as const;

export const BLOG_EMPTY_STATE = {
  heading: 'Articles are on their way.',
  body: 'We publish practical guides to answer-engine optimization, evidence-led measurement, and the work between a finding and the next audit. Check back soon or explore the documentation.',
} as const;

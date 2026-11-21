import { POST_AUDIT } from './blog-posts/audit';
import { POST_BUYER_PROMPTS } from './blog-posts/buyer-prompts';
import { POST_CHATGPT_SHOPPING } from './blog-posts/chatgpt-shopping';
import { POST_CONNECT } from './blog-posts/connect';
import { POST_CONTENT_OPTIMIZATION } from './blog-posts/content-optimization';
import { POST_INTERNAL_LINKS } from './blog-posts/internal-links';
import { POST_PLAYBOOK } from './blog-posts/playbook';

type DiagramFlowStep = { step: string; title: string; desc: string };

type BlogDiagram = { variant: 'flow'; data: { steps: readonly DiagramFlowStep[] } };

export type BlogBlock =
  | { type: 'heading'; text: string }
  | { type: 'subheading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'richParagraph'; content: readonly BlogInline[] }
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

type BlogInline =
  | string
  | { type: 'link'; text: string; href: `/${string}` | `https://${string}` }
  | { type: 'citation'; sourceId: string; label?: string };

export type BlogSource = {
  id: string;
  title: string;
  publisher: string;
  url: `https://${string}` | `http://${string}`;
  publishedDate?: string;
};

export type BlogPost = {
  slug: string;
  title: string;
  seoTitle: string;
  seoDescription: string;
  excerpt: string;
  image?: string;
  cardImage?: string;
  date?: string;
  dateModified?: string;
  readTime?: string;
  author?: string;
  authorRole?: string;
  authorUrl?: string;
  tags: readonly string[];
  sources: readonly BlogSource[];
  relatedSlugs: readonly string[];
  editorialNote?: string;
  closing?: { heading: string; body: string; secondary?: { href: string; label: string } };
  body: readonly BlogBlock[];
};

export const POSTS: readonly BlogPost[] = [
  POST_CONNECT,
  POST_AUDIT,
  POST_PLAYBOOK,
  POST_BUYER_PROMPTS,
  POST_INTERNAL_LINKS,
  POST_CONTENT_OPTIMIZATION,
  POST_CHATGPT_SHOPPING,
] as const;

export const BLOG_EMPTY_STATE = {
  heading: 'Articles are on their way',
  body: 'We publish practical guides to answer-engine optimization, evidence-led measurement, and the work between a finding and the next audit. Check back soon or explore the documentation.',
} as const;

export const BLOG_START_PATHS = [
  {
    heading: 'Measure visibility',
    body: 'Learn what to count, how to keep observations comparable, and why a visibility percentage needs a clear denominator.',
    label: 'Read the measurement guide',
    slug: 'verify-improve-ai-search-visibility',
  },
  {
    heading: 'Investigate citations',
    body: 'Turn a cited source into a specific research task. Check relevance, factual accuracy and the pages a buyer would find useful.',
    label: 'Read the citation guide',
    slug: POST_PLAYBOOK.slug,
  },
  {
    heading: 'Check website readiness',
    body: 'Work through access, indexing, content clarity and evidence before assuming that a missing citation is a writing problem.',
    label: 'Read the website audit guide',
    slug: POST_AUDIT.slug,
  },
] as const;

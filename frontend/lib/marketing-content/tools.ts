import type { FaqItem } from './faq';

/** `updated` is the page's sitemap <lastmod>: revise it when the tool or its guide changes. */
export const FREE_TOOLS = [
  {
    slug: 'ai-crawler-checker',
    updated: '2026-10-10',
    title: 'AI crawler rules tester',
    category: 'Crawl access',
    description:
      'Find which crawlers your robots.txt allows, with the exact rule behind each result.',
    input: 'Paste robots.txt',
    limitation:
      'Checks supplied rules only. This test cannot establish firewall access, actual indexing or AI citations.',
  },
  {
    slug: 'robots-txt-generator',
    updated: '2026-10-10',
    title: 'Robots.txt generator',
    category: 'Crawl access',
    description:
      'Choose crawler permissions, add your sitemap and download a tested starting point.',
    input: 'Choose permissions',
    limitation:
      'Review and merge with your existing file before publishing. Robots.txt is not access control and does not remove indexed pages.',
  },
  {
    slug: 'meta-directive-checker',
    updated: '2026-10-26',
    title: 'Meta and indexing directive checker',
    category: 'Page inspection',
    description:
      'Inspect pasted HTML and response headers for indexing directives and canonical conflicts.',
    input: 'Paste HTML and headers',
    limitation:
      'Reports declarations in your input, not live index status. JavaScript changes, missing headers and crawler-specific interpretation may change the outcome.',
  },
  {
    slug: 'structured-data-builder',
    updated: '2026-10-10',
    title: 'Structured data builder',
    category: 'Page inspection',
    description: 'Create Article, Organization or Breadcrumb JSON-LD from facts you provide.',
    input: 'Enter page details',
    limitation:
      'This is a markup builder, not a rich-result eligibility test. Use accurate facts visible on the page; markup does not guarantee rankings or citations.',
  },
  {
    slug: 'sitemap-comparison',
    updated: '2026-10-26',
    title: 'Sitemap comparison',
    category: 'Site maintenance',
    description: 'Compare two XML sitemap files and export the URLs added, removed and kept.',
    input: 'Upload or paste XML',
    limitation:
      'Compares the URLs declared in two files without fetching them. Sitemap indexes compare child sitemap addresses, not the pages inside them.',
  },
  {
    slug: 'social-preview',
    updated: '2026-10-10',
    title: 'Social preview tool',
    category: 'Page inspection',
    description:
      'Preview your title, description and image, then copy the corresponding social tags.',
    input: 'Enter share details',
    limitation:
      'The preview is approximate. Platforms may crop images, shorten text or use cached content differently. Image URLs are not fetched or verified.',
  },
] as const;

type FreeToolSlug = (typeof FREE_TOOLS)[number]['slug'];

/** What a tool inspects, how to read its output and the questions people ask about it. */
export type ToolGuide = {
  checks: readonly string[];
  reading: readonly string[];
  faqs: readonly FaqItem[];
};

export const TOOL_GUIDES: Partial<Record<FreeToolSlug, ToolGuide>> = {
  'meta-directive-checker': {
    checks: [
      'Robots meta tags named robots, googlebot (including variants such as googlebot-news) and bingbot, with their full content.',
      'X-Robots-Tag lines in the response headers you paste, including crawler-scoped rules such as "googlebot: noindex".',
      'Canonical declarations, both <link rel="canonical"> in the HTML and a canonical Link response header.',
      'The page title and meta description, so you can confirm you pasted the page you meant.',
    ],
    reading: [
      'Indexing declarations lists every rule found. A noindex or none in a rule that applies to a crawler keeps the page out of that crawler’s index, even when another rule says index.',
      'Check the scope of each rule: robots applies to every crawler, while a googlebot or bingbot meta tag, or an X-Robots-Tag prefixed with a crawler name, applies only to that crawler.',
      'Canonical declarations should normally be a single URL pointing at the page itself. Two or more, or one pointing at another URL, means search engines may index a different page.',
      '"None found" describes your input only. A robots.txt block, a server error or a directive added by JavaScript can still stop the page being indexed.',
    ],
    faqs: [
      {
        q: 'Why is a page with noindex still showing in Google?',
        a: 'Google has to recrawl the page to see the directive, and keeps its existing copy until then. If robots.txt blocks the page, Google cannot read the noindex at all, so the URL can stay indexed.',
      },
      {
        q: 'Does an index directive cancel a noindex?',
        a: 'No. When rules conflict, Google applies the more restrictive one, so an applicable noindex wins. The checker flags pages that declare both.',
      },
      {
        q: 'Should I use the robots meta tag or the X-Robots-Tag header?',
        a: 'Both are honoured for HTML pages. The header also works for files without HTML, such as PDFs and images. Use one place per page so the two cannot disagree.',
      },
      {
        q: 'Is a canonical tag a directive?',
        a: 'No. It is a strong hint. Search engines can choose a different canonical when redirects, internal links or sitemaps point elsewhere, so keep those signals consistent with the tag.',
      },
      {
        q: 'Is the HTML I paste uploaded?',
        a: 'No. The tool parses your input in this browser without running its scripts or loading its images, and nothing is sent or saved.',
      },
    ],
  },
  'sitemap-comparison': {
    checks: [
      'Both files parse as sitemaps.org XML: either two urlset sitemaps or two sitemap indexes.',
      'Every loc URL, compared as an exact string, sorted into added, removed and kept.',
      'Duplicate loc entries within each file.',
      'Malformed input: unclosed tags, entries with no loc or more than one, and document type or entity declarations, which are refused.',
    ],
    reading: [
      'Removed URLs left the sitemap. Confirm each one was retired on purpose and now redirects or returns 404 or 410, rather than being dropped by a CMS or plugin change.',
      'Added URLs should each return 200, declare themselves as canonical and carry no noindex. A sitemap should list only pages you want indexed.',
      'Matching is exact, so https://example.com/a and https://example.com/a/ are different URLs. Long added and removed lists of near-identical URLs usually mean a trailing slash, protocol or host change.',
      'Duplicates do not harm crawling but usually point to a bug in the sitemap generator.',
    ],
    faqs: [
      {
        q: 'When should I compare two sitemaps?',
        a: 'Before and after a site migration, redesign, CMS or plugin update, or any change to URL structure. Compare the live sitemap with the one from staging or from the previous release.',
      },
      {
        q: 'Does the tool check whether the URLs work?',
        a: 'No. It compares the URLs each file declares and never fetches them. Check the status, canonical tag and robots directives of added and removed URLs separately.',
      },
      {
        q: 'Can I compare sitemap index files?',
        a: 'Yes, two indexes against each other. The comparison covers the child sitemap addresses, not the pages inside them, so compare each child sitemap separately to see page changes.',
      },
      {
        q: 'Are lastmod, changefreq and priority compared?',
        a: 'No, only loc URLs. Google uses lastmod when it is consistently accurate and ignores changefreq and priority.',
      },
      {
        q: 'How large a sitemap can I compare?',
        a: 'Up to 10,000 entries per file, within the 200,000-character limit for each text area. Files are read in this browser and are not uploaded.',
      },
    ],
  },
};

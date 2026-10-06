export const FREE_TOOLS = [
  {
    slug: 'ai-crawler-checker',
    title: 'AI crawler rules tester',
    category: 'Crawl access',
    description:
      'Find which crawlers your robots.txt allows, with the exact rule behind each result.',
    input: 'Paste robots.txt',
    limitation:
      'Checks supplied rules only. Firewall access, actual indexing and AI citations cannot be established by this test.',
  },
  {
    slug: 'robots-txt-generator',
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
    title: 'Structured data builder',
    category: 'Page inspection',
    description: 'Create Article, Organization or Breadcrumb JSON-LD from facts you provide.',
    input: 'Enter page details',
    limitation:
      'This is a markup builder, not a rich-result eligibility test. Use accurate facts visible on the page; markup does not guarantee rankings or citations.',
  },
  {
    slug: 'sitemap-comparison',
    title: 'Sitemap comparison',
    category: 'Site maintenance',
    description: 'Compare two XML sitemap files and export the URLs added, removed and kept.',
    input: 'Upload or paste XML',
    limitation:
      'Compares the URLs declared in two files without fetching them. Sitemap indexes compare child sitemap addresses, not the pages inside them.',
  },
  {
    slug: 'social-preview',
    title: 'Social preview tool',
    category: 'Page inspection',
    description:
      'Preview your title, description and image, then copy the corresponding social tags.',
    input: 'Enter share details',
    limitation:
      'An approximate preview. Platforms may crop images, shorten text or use cached content differently. Image URLs are not fetched or verified.',
  },
] as const;

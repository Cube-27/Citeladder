import { describe, expect, it } from 'vitest';
import { docsArticleJsonLd, updatedLabel } from './structured-data';

describe('docs article structured data', () => {
  it('declares the visible headline, updated date and the website organization as publisher', () => {
    expect(
      docsArticleJsonLd({
        title: 'Connect with MCP',
        description: 'Use saved evidence in an assistant.',
        url: 'https://docs.citeladder.com/mcp/',
        updated: '2026-10-11',
        websiteUrl: 'https://citeladder.com/',
      }),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      '@id': 'https://docs.citeladder.com/mcp/',
      url: 'https://docs.citeladder.com/mcp/',
      headline: 'Connect with MCP',
      description: 'Use saved evidence in an assistant.',
      inLanguage: 'en',
      dateModified: '2026-10-11',
      mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://docs.citeladder.com/mcp/' },
      publisher: {
        '@type': 'Organization',
        '@id': 'https://citeladder.com/#organization',
        name: 'CiteLadder',
        url: 'https://citeladder.com/',
      },
    });
  });

  it('shows the updated date as the calendar day it names', () => {
    expect(updatedLabel('2026-01-01')).toBe('January 1, 2026');
  });
});

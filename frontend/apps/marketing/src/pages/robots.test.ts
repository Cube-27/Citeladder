import robotsParser from 'robots-parser';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { GET } from './robots.txt';

afterEach(() => vi.unstubAllEnvs());

describe('marketing crawl policy', () => {
  it.each(['Googlebot', 'Google-InspectionTool', 'GPTBot'])(
    'allows the sitemap while excluding private route boundaries for %s',
    async (userAgent) => {
      vi.stubEnv('PUBLIC_WEBSITE_ORIGIN', 'https://example.com');
      vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.example.com');
      const policy = robotsParser('https://example.com/robots.txt', await GET().text());

      for (const path of ['/', '/sitemap.xml', '/blog/verify-improve-ai-search-visibility']) {
        expect(policy.isAllowed(`https://example.com${path}`, userAgent), path).toBe(true);
      }
      for (const path of [
        '/site',
        '/site/',
        '/site/pages',
        '/site?tab=issues',
        '/settings',
        '/settings/profile',
        '/settings?tab=account',
        '/api/v1/projects',
      ]) {
        expect(policy.isAllowed(`https://example.com${path}`, userAgent), path).toBe(false);
      }
    },
  );
});

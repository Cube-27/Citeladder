import robotsParser from 'robots-parser';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { GET } from './pages/robots.txt';

afterEach(() => vi.unstubAllEnvs());

describe('marketing crawl policy', () => {
  it.each(['Googlebot', 'Google-InspectionTool', 'GPTBot'])(
    'allows public pages and retired app paths but not the API for %s',
    async (userAgent) => {
      vi.stubEnv('PUBLIC_WEBSITE_ORIGIN', 'https://example.com');
      vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.example.com');
      const policy = robotsParser('https://example.com/robots.txt', await GET().text());

      for (const path of [
        '/',
        '/sitemap.xml',
        '/blog/verify-improve-ai-search-visibility',
        '/settings/profile',
      ]) {
        expect(policy.isAllowed(`https://example.com${path}`, userAgent), path).toBe(true);
      }
      for (const path of ['/api/v1/projects', '/api/v1/contact']) {
        expect(policy.isAllowed(`https://example.com${path}`, userAgent), path).toBe(false);
      }
    },
  );
});

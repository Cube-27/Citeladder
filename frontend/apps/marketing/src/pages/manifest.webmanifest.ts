import { SITE_NAME, SITE_TAGLINE } from '@/lib/seo/site';

/** Name and icon for browsers; the site is a website, not an installable app. */
export function GET() {
  return new Response(
    JSON.stringify({
      name: SITE_NAME,
      short_name: SITE_NAME,
      description: SITE_TAGLINE,
      start_url: '/',
      icons: [{ src: '/citeladder-favicon.ico', type: 'image/x-icon', sizes: '256x256' }],
    }),
    {
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
      },
    },
  );
}

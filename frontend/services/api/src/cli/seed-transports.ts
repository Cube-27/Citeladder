/** Closed recorded transports. An unrecognized request is a failure, never live I/O. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { devSeed } from '../config/dev-seed.ts';
import type { WebsiteFetcher } from '../projects/safe-fetch.ts';
import { IntegrationClient } from '../integrations/client.ts';

export function seedAnswer(prompt: string, generation = 0) {
  const bucket = Math.min(
    2,
    Number(BigInt('0x' + createHash('md5').update(prompt).digest('hex')) % 3n) + generation,
  );
  const own = devSeed.products
    .map((p, i) => `${i + 1}. ${p.name} - $${p.price.toFixed(2)} (${p.url}) - lifetime warranty.`)
    .join('\n');
  const rival = devSeed.competitorProduct;
  const answer_text =
    bucket === 0
      ? `For '${prompt}', TrailBlaze Packs and Summit Gear are popular.\n1. ${rival.name} - $${rival.price} (${rival.url}) - two-year warranty.`
      : `For '${prompt}', Wanderlust Gear Co. is recommended.\n${own}${bucket === 1 ? `\n3. ${rival.name} - $${rival.price} (${rival.url}) - TrailBlaze Packs alternative.` : ''}`;
  const labels =
    bucket === 0
      ? ['TrailBlaze Packs']
      : bucket === 1
        ? ['Wanderlust Gear', 'TrailBlaze Packs']
        : ['Wanderlust Gear'];
  return {
    answer_text,
    search_used: true,
    citations: labels.map((label, ordinal) => {
      const start_index = answer_text.indexOf(label),
        owned = label === 'Wanderlust Gear';
      return {
        ordinal,
        url: owned
          ? `https://wanderlustgear.com/${bucket === 2 ? 'reviews' : 'backpacks'}`
          : 'https://trailblazepacks.com/',
        title: label,
        domain: owned ? 'wanderlustgear.com' : 'trailblazepacks.com',
        start_index,
        end_index: start_index + label.length,
        cited_text: label,
      };
    }),
  };
}

export function seedIntegrationClient(metricDate: string) {
  return new IntegrationClient(
    {},
    {
      sleep: async () => undefined,
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        if (
          url.hostname === 'www.googleapis.com' &&
          url.pathname.endsWith('/searchAnalytics/query')
        ) {
          const values: Record<string, string> = {
            query: 'best hiking backpack',
            page: 'https://wanderlustgear.com/backpacks',
            searchAppearance: 'WEB',
            device: 'MOBILE',
            country: 'usa',
            date: metricDate,
          };
          const dimensions = body.dimensions as string[];
          return Response.json({
            rows:
              Number(body.startRow ?? 0) > 0
                ? []
                : [
                    {
                      keys: dimensions.map((d) => values[d] ?? 'seed'),
                      clicks: 12,
                      impressions: 240,
                      ctr: 0.05,
                      position: 6,
                    },
                  ],
          });
        }
        if (
          url.hostname === 'analyticsdata.googleapis.com' &&
          url.pathname.endsWith(':runReport')
        ) {
          const values: Record<string, string> = {
            date: metricDate.replaceAll('-', ''),
            sessionDefaultChannelGroup: 'Organic Search',
            sessionSource: 'google',
            sessionMedium: 'organic',
            fullReferrer: 'https://google.com/',
            landingPage: '/backpacks',
            landingPagePlusQueryString: '/backpacks',
            itemId: 'WGC-S40-BLK',
            itemName: 'Summit 40L Trail Pack',
          };
          const dimensions = (body.dimensions as { name: string }[]).map((d) => d.name);
          const metrics = (body.metrics as { name: string }[]).map((m) => m.name);
          return Response.json({
            dimensionHeaders: dimensions.map((name) => ({ name })),
            metricHeaders: metrics.map((name) => ({ name, type: 'TYPE_INTEGER' })),
            rows:
              Number(body.offset ?? 0) > 0
                ? []
                : [
                    {
                      dimensionValues: dimensions.map((d) => ({ value: values[d] ?? 'seed' })),
                      metricValues: metrics.map(() => ({ value: '12' })),
                    },
                  ],
            rowCount: 1,
          });
        }
        throw new Error('unexpected_seed_integration_request');
      },
    },
  );
}

/** Reuse the retained HTML corpus; paths are deterministic and no network is reachable. */
export async function seedWebsiteFetcher(): Promise<WebsiteFetcher> {
  const fixtures = new URL('../../../../../backend/tests/fixtures/site_health/', import.meta.url);
  const pages = new Map<string, { body: Buffer; contentType: string }>();
  pages.set('/', {
    body: await readFile(new URL('flat_category_listing.html', fixtures)),
    contentType: 'text/html',
  });
  pages.set('/backpacks', {
    body: await readFile(new URL('broken_pdp_schema_mismatch.html', fixtures)),
    contentType: 'text/html',
  });
  for (const path of [
    '/womens-tops',
    '/womens-jeans',
    '/womens-pyjamas',
    '/company/privacypolicy',
    ...Array.from({ length: 8 }, (_, index) => `/dress-${index + 1}`),
  ])
    pages.set(path, pages.get('/backpacks')!);
  pages.set('/robots.txt', {
    body: Buffer.from('User-agent: *\nAllow: /\nSitemap: https://wanderlustgear.com/sitemap.xml\n'),
    contentType: 'text/plain',
  });
  pages.set('/sitemap.xml', {
    body: Buffer.from(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://wanderlustgear.com/</loc></url><url><loc>https://wanderlustgear.com/backpacks</loc></url></urlset>',
    ),
    contentType: 'application/xml',
  });
  return async (input, options) => {
    const url = new URL(input);
    if (url.hostname !== 'wanderlustgear.com') throw new Error('unexpected_seed_site_host');
    const served = pages.get(url.pathname);
    const send = async () => {
      await options.authorize?.(url);
      const status = served ? 200 : 404,
        body = served?.body ?? Buffer.alloc(0);
      options.onCall?.({
        url: url.href,
        status,
        error: null,
        wireBytes: body.length,
        decodedBytes: body.length,
        ttfbMs: 1,
        latencyMs: 1,
      });
      return { url: url.href, status, body, contentType: served?.contentType ?? 'text/plain' };
    };
    return options.gate ? options.gate(url, send, AbortSignal.timeout(5000)) : send();
  };
}

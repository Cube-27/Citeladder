import { llmsTxt } from '@/lib/marketing-content/llms';
import { absoluteUrl } from '@/lib/seo/site';
import { PUBLIC_ROUTES } from '../public-routes';

export function GET() {
  const body = llmsTxt({
    pages: PUBLIC_ROUTES.map((route) => ({
      title: route.title,
      url: absoluteUrl(route.path) ?? route.path,
      kind: route.kind,
    })),
  });
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

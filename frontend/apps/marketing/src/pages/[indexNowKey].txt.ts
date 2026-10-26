import { INDEXNOW_KEY } from '@/lib/seo/indexnow';

export function getStaticPaths() {
  return [{ params: { indexNowKey: INDEXNOW_KEY } }];
}

export function GET() {
  return new Response(INDEXNOW_KEY, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

import { LLMS_TXT } from '@/lib/marketing-content/llms';

export function GET() {
  return new Response(LLMS_TXT, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

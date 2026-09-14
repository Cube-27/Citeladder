/** Process-only liveness: no database or backend dependency work. */
export function GET() {
  return new Response(JSON.stringify({ status: 'ok' }), {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json',
    },
  });
}

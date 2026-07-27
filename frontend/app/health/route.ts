import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Process-only liveness: no database or backend dependency work. */
export function GET() {
  return NextResponse.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}

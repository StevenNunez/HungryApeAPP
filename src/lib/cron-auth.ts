import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * Guards cron routes. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 * Fails CLOSED: if CRON_SECRET is not configured the route refuses to run,
 * instead of silently being public.
 * Returns a NextResponse to send back when the request must be rejected, or null when OK.
 */
export function rejectUnlessCron(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET is not configured — refusing to run cron route');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get('authorization') ?? '');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

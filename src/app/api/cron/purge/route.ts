import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { rejectUnlessCron } from '@/lib/cron-auth';

/**
 * GET /api/cron/purge — daily housekeeping for short-lived personal data:
 * push subscriptions and WhatsApp links (which may hold a phone number) older than 2 days.
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCron(request);
  if (denied) return denied;

  const supabase = createServiceSupabaseClient();
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const [push, wa] = await Promise.all([
    (supabase as any).from('push_subscriptions').delete({ count: 'exact' }).lt('created_at', cutoff),
    (supabase as any).from('whatsapp_links').delete({ count: 'exact' }).lt('created_at', cutoff),
  ]);

  return NextResponse.json({
    pushDeleted: push.count ?? 0,
    whatsappDeleted: wa.count ?? 0,
    errors: [push.error?.message, wa.error?.message].filter(Boolean),
  });
}

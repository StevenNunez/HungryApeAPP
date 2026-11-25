import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { rejectUnlessCron } from '@/lib/cron-auth';
import { anotarError } from '@/lib/errores-servidor';

/**
 * GET /api/cron/purge — daily housekeeping for short-lived personal data:
 * push subscriptions and WhatsApp links (which may hold a phone number) older than 2 days,
 * plus abandoned "Por Pagar" orders (>60 min) of every tenant, which return their stock.
 * (Kitchens and new orders already expire their own tenant's; this catches idle tenants.)
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCron(request);
  if (denied) return denied;

  const supabase = createServiceSupabaseClient();
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const [push, wa, expired] = await Promise.all([
    (supabase as any).from('push_subscriptions').delete({ count: 'exact' }).lt('created_at', cutoff),
    (supabase as any).from('whatsapp_links').delete({ count: 'exact' }).lt('created_at', cutoff),
    (supabase as any).rpc('expire_unpaid_orders', {}),
  ]);

  const errors = [push.error?.message, wa.error?.message, expired.error?.message].filter(Boolean);
  if (errors.length > 0) await anotarError({ origen: 'servidor', donde: 'api/cron/purge', error: errors.join(' | ') });

  return NextResponse.json(
    {
      pushDeleted: push.count ?? 0,
      whatsappDeleted: wa.count ?? 0,
      ordersExpired: expired.data ?? 0,
      errors,
    },
    // 500 so a failing cron shows up as failed in Vercel instead of a silent 200
    { status: errors.length > 0 ? 500 : 200 },
  );
}

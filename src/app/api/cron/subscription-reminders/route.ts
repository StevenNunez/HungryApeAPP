import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { sendSubscriptionExpiringEmail } from '@/lib/email';

/**
 * GET /api/cron/subscription-reminders
 *
 * Runs daily (configured in vercel.json at 12:00 UTC = 9:00 AM Santiago).
 * Finds tenants whose trial ends in exactly 7, 3, or 1 day and sends a reminder.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const now = new Date();
  const results: { tenantId: string; email: string; daysLeft: number }[] = [];
  const errors: { tenantId: string; error: string }[] = [];

  // Check for trials expiring in 7, 3, and 1 day
  for (const daysLeft of [7, 3, 1]) {
    // Window: today+N from 00:00 to 23:59 UTC
    const windowStart = new Date(now);
    windowStart.setUTCHours(0, 0, 0, 0);
    windowStart.setUTCDate(windowStart.getUTCDate() + daysLeft);

    const windowEnd = new Date(windowStart);
    windowEnd.setUTCHours(23, 59, 59, 999);

    const { data: tenants, error } = await (supabase
      .from('tenants') as any)
      .select('id, name, owner_id')
      .eq('subscription_status', 'trial')
      .gte('trial_ends_at', windowStart.toISOString())
      .lte('trial_ends_at', windowEnd.toISOString());

    if (error) {
      console.error(`Error querying trials expiring in ${daysLeft}d:`, error);
      continue;
    }

    for (const tenant of tenants ?? []) {
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(tenant.owner_id);
        const email = authUser?.user?.email;
        if (!email) continue;

        await sendSubscriptionExpiringEmail({
          to: email,
          businessName: tenant.name,
          daysLeft,
        });

        results.push({ tenantId: tenant.id, email, daysLeft });
      } catch (err: any) {
        console.error(`Failed reminder for tenant ${tenant.id}:`, err);
        errors.push({ tenantId: tenant.id, error: err.message });
      }
    }
  }

  return NextResponse.json({
    sent: results.length,
    errors: errors.length,
    details: results,
  });
}

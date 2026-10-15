import { NextRequest, NextResponse } from 'next/server';
import { PreApproval } from 'mercadopago';
import { mercadoPagoClient } from '@/lib/mercadopago';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { rejectUnlessCron } from '@/lib/cron-auth';

/**
 * GET /api/cron/check-subscriptions
 *
 * Daily (Vercel Hobby allows at most one run per day). Keeps tenants' subscription state in sync even if a webhook was missed:
 *  - Annual plans (one-off payment, have subscription_expires_at): deactivated once the term ends.
 *  - Monthly plans (Mercado Pago PreApproval): status mirrored from Mercado Pago.
 *
 * Uses the service-role client: there is no user session in a cron, and with RLS the
 * UPDATEs would silently affect 0 rows.
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCron(request);
  if (denied) return denied;

  const supabase = createServiceSupabaseClient();
  const nowIso = new Date().toISOString();
  const changes: { tenantId: string; old: string | null; new: string }[] = [];
  const failures: { tenantId: string; error: string }[] = [];

  async function setStatus(tenantId: string, oldStatus: string | null, newStatus: string) {
    const { error } = await supabase.from('tenants')
      .update({ subscription_status: newStatus, subscription_updated_at: nowIso })
      .eq('id', tenantId);
    if (error) {
      console.error(`Error updating tenant ${tenantId}:`, error);
      failures.push({ tenantId, error: error.message });
      return;
    }
    changes.push({ tenantId, old: oldStatus, new: newStatus });
  }

  // ── 1. Annual plans whose 12-month term ended ────────────────────────────
  const { data: expired, error: expiredError } = await supabase.from('tenants')
    .select('id, subscription_status')
    .eq('subscription_status', 'active')
    .not('subscription_expires_at', 'is', null)
    .lt('subscription_expires_at', nowIso);
  if (expiredError) console.error('Error querying expired annual plans:', expiredError);
  for (const t of expired ?? []) {
    await setStatus(t.id, t.subscription_status, 'inactive');
  }

  // ── 2. Monthly plans: mirror the PreApproval state ───────────────────────
  const { data: tenants, error: tenantsError } = await supabase.from('tenants')
    .select('id, subscription_payment_id, subscription_status')
    .not('subscription_payment_id', 'is', null)
    .is('subscription_expires_at', null)
    .not('plan_id', 'eq', 'gratis');
  if (tenantsError) console.error('Error querying subscriptions:', tenantsError);

  const preapprovalApi = new PreApproval(mercadoPagoClient);
  for (const tenant of tenants ?? []) {
    try {
      const subData = await preapprovalApi.get({ id: tenant.subscription_payment_id! });

      let newStatus = 'inactive';
      if (subData.status === 'authorized' || subData.status === 'approved') newStatus = 'active';
      if (subData.status === 'paused') newStatus = 'paused';
      if (subData.status === 'cancelled') newStatus = 'cancelled';

      if (newStatus !== tenant.subscription_status) {
        await setStatus(tenant.id, tenant.subscription_status, newStatus);
      }
    } catch (err: any) {
      // Legacy annual tenants (payment id, not a PreApproval) end up here; harmless
      console.warn(`Skipping tenant ${tenant.id}: ${err?.message ?? err}`);
    }
  }

  return NextResponse.json({
    checked: (tenants?.length ?? 0) + (expired?.length ?? 0),
    updated: changes.length,
    failed: failures.length,
    changes,
  });
}

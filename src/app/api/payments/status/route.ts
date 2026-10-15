import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase/server';
import { getEffectivePlan, isProPlan } from '@/lib/plans';
import { isMarketplaceConfigured } from '@/lib/mp-seller';

/** GET /api/payments/status — connection state of the logged-in business' online payments. */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, plan_id, subscription_status, trial_ends_at, subscription_expires_at')
    .eq('owner_id', user.id)
    .single();
  if (!tenant) return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 });

  const { data: acc } = await (createServiceSupabaseClient() as any)
    .from('tenant_payment_accounts')
    .select('mp_user_id, connected_at')
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  return NextResponse.json({
    available: isMarketplaceConfigured(),
    eligible: isProPlan(getEffectivePlan(tenant)),
    connected: !!acc,
    mpUserId: acc?.mp_user_id ?? null,
    connectedAt: acc?.connected_at ?? null,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getEffectivePlan, isProPlan } from '@/lib/plans';
import { signState } from '@/lib/crypto';
import { appBaseUrl, buildAuthorizationUrl, connectRedirectUri, isMarketplaceConfigured } from '@/lib/mp-seller';

/**
 * GET /api/payments/connect/start
 * Sends the business owner to Mercado Pago to authorize Hungry Ape (OAuth) so customers'
 * online payments land directly in THEIR Mercado Pago account.
 */
export async function GET(request: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/dashboard/configuracion?pagos=${q}`, request.url));

  if (!isMarketplaceConfigured()) return back('no-disponible');

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, plan_id, subscription_status, trial_ends_at, subscription_expires_at')
    .eq('owner_id', user.id)
    .single();
  if (!tenant) return back('error');
  if (!isProPlan(getEffectivePlan(tenant))) return back('requiere-pro');

  const state = signState({ tenantId: tenant.id });
  const redirectUri = connectRedirectUri(appBaseUrl(new URL(request.url).origin));
  return NextResponse.redirect(buildAuthorizationUrl(state, redirectUri));
}

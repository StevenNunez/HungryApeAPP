import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { verifyState } from '@/lib/crypto';
import {
  appBaseUrl, connectRedirectUri, exchangeCodeForAccount, isMarketplaceConfigured, saveSellerAccount,
} from '@/lib/mp-seller';

/**
 * GET /api/payments/connect/callback?code=...&state=...
 * Mercado Pago sends the owner back here after authorizing. The signed `state` proves the
 * flow was started by this server for this business, and the logged-in user must own it.
 */
export async function GET(request: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/dashboard/configuracion?pagos=${q}`, request.url));

  if (!isMarketplaceConfigured()) return back('no-disponible');

  const params = request.nextUrl.searchParams;
  if (params.get('error')) return back('cancelado');

  const code = params.get('code');
  const state = verifyState(params.get('state'));
  if (!code || !state) return back('error');

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const { data: tenant } = await supabase
    .from('tenants').select('id').eq('owner_id', user.id).single();
  if (!tenant || tenant.id !== state.tenantId) return back('error');

  try {
    const redirectUri = connectRedirectUri(appBaseUrl(new URL(request.url).origin));
    const tokens = await exchangeCodeForAccount(code, redirectUri);
    await saveSellerAccount(tenant.id, tokens);
    return back('conectado');
  } catch (err: any) {
    console.error('MP connect failed:', err?.message ?? err);
    return back('error');
  }
}

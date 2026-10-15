import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { decryptSecret, encryptSecret, isEncryptionConfigured } from '@/lib/crypto';

/**
 * Online payments for each business through Mercado Pago "Marketplace" (split payments):
 * every business connects ITS OWN Mercado Pago account with OAuth, the customer pays
 * straight into that account, Mercado Pago's fee is charged to the business, and Hungry Ape
 * can add an optional marketplace fee (MP_MARKETPLACE_FEE_PERCENT). We never hold the money.
 *
 * Env: MP_CLIENT_ID, MP_CLIENT_SECRET (the marketplace app), PAYMENTS_ENC_KEY,
 *      MP_MARKETPLACE_FEE_PERCENT (optional, 0-10), MP_MARKETPLACE_WEBHOOK_SECRET (optional).
 * Docs: https://www.mercadopago.cl/developers/en/docs/split-payments/integration-configuration/integrate-marketplace
 */

const MP_API = 'https://api.mercadopago.com';
const MP_AUTH = 'https://auth.mercadopago.cl/authorization';
const REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000;

export function isMarketplaceConfigured(): boolean {
  return !!(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET && isEncryptionConfigured());
}

export function appBaseUrl(requestOrigin?: string): string {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  return (requestOrigin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export const connectRedirectUri = (base: string) => `${base}/api/payments/connect/callback`;

export function buildAuthorizationUrl(state: string, redirectUri: string): string {
  const q = new URLSearchParams({
    client_id: process.env.MP_CLIENT_ID!,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: redirectUri,
  });
  return `${MP_AUTH}?${q.toString()}`;
}

/** Marketplace fee in CLP for an order total (integer; capped at 10% of the order). */
export function marketplaceFee(total: number): number {
  const pct = Math.min(10, Math.max(0, Number(process.env.MP_MARKETPLACE_FEE_PERCENT ?? 0)));
  if (!pct) return 0;
  return Math.round((total * pct) / 100);
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number | string;
}

async function oauthToken(body: Record<string, string>): Promise<OAuthTokenResponse> {
  const res = await fetch(`${MP_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      ...body,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Mercado Pago OAuth failed (${res.status}): ${json?.message ?? json?.error ?? 'unknown'}`);
  }
  return json as OAuthTokenResponse;
}

export async function exchangeCodeForAccount(code: string, redirectUri: string) {
  return oauthToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
}

/** Stores (encrypted) the tokens of a business' Mercado Pago account. */
export async function saveSellerAccount(tenantId: string, t: OAuthTokenResponse) {
  const supabase = createServiceSupabaseClient();
  const { error } = await (supabase as any).from('tenant_payment_accounts').upsert({
    tenant_id: tenantId,
    provider: 'mercadopago',
    mp_user_id: t.user_id !== undefined ? String(t.user_id) : null,
    access_token_enc: encryptSecret(t.access_token),
    refresh_token_enc: t.refresh_token ? encryptSecret(t.refresh_token) : null,
    expires_at: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null,
    connected_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/**
 * Returns a valid access token for the business, refreshing it first when it is about to
 * expire (Mercado Pago seller tokens last ~180 days). Null when the business never connected.
 */
export async function getSellerAccessToken(tenantId: string): Promise<string | null> {
  const supabase = createServiceSupabaseClient();
  const { data: acc } = await (supabase as any)
    .from('tenant_payment_accounts')
    .select('access_token_enc, refresh_token_enc, expires_at')
    .eq('tenant_id', tenantId)
    .single();
  if (!acc) return null;

  const expiresSoon = acc.expires_at && new Date(acc.expires_at).getTime() - Date.now() < REFRESH_MARGIN_MS;
  if (expiresSoon && acc.refresh_token_enc) {
    try {
      const fresh = await oauthToken({ grant_type: 'refresh_token', refresh_token: decryptSecret(acc.refresh_token_enc) });
      await saveSellerAccount(tenantId, fresh);
      return fresh.access_token;
    } catch (err: any) {
      console.warn('Seller token refresh failed:', err?.message);
      // fall through: the current token may still work
    }
  }
  return decryptSecret(acc.access_token_enc);
}

export interface OrderPreferenceInput {
  accessToken: string;
  orderId: string;
  tenantId: string;
  title: string;
  total: number;
  baseUrl: string;
  backUrl: string;
}

/** Creates the Checkout Pro preference in the BUSINESS' account, with our marketplace fee. */
export async function createOrderPreference(i: OrderPreferenceInput): Promise<string> {
  const fee = marketplaceFee(i.total);
  const body: Record<string, unknown> = {
    items: [{ id: i.orderId, title: i.title, quantity: 1, unit_price: Math.round(i.total), currency_id: 'CLP' }],
    external_reference: JSON.stringify({ orderId: i.orderId, tenantId: i.tenantId }),
    notification_url: `${i.baseUrl}/api/mercadopago/orders-webhook?tenant=${i.tenantId}`,
    back_urls: { success: i.backUrl, failure: i.backUrl, pending: i.backUrl },
    ...(i.baseUrl.startsWith('https://') ? { auto_return: 'approved' } : {}),
    ...(fee > 0 ? { marketplace_fee: fee } : {}),
  };

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${i.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mercado Pago preference failed (${res.status}): ${json?.message ?? 'unknown'}`);

  const isSandbox = i.accessToken.startsWith('TEST-');
  const url = isSandbox ? json.sandbox_init_point || json.init_point : json.init_point;
  if (!url) throw new Error('Mercado Pago did not return a checkout URL');
  return url as string;
}

export async function fetchSellerPayment(accessToken: string, paymentId: string) {
  const res = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Mercado Pago payment lookup failed (${res.status})`);
  return res.json() as Promise<{
    id: number | string;
    status: string;
    transaction_amount?: number;
    external_reference?: string;
  }>;
}

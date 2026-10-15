import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { isAllowedPushEndpoint, isPushConfigured } from '@/lib/push';
import { notificationsAllowed } from '@/lib/notify';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SUBS_PER_ORDER = 3;

/**
 * POST /api/push/subscribe   { orderId, subscription: { endpoint, keys: { p256dh, auth } } }
 *
 * Registers the customer's browser to be notified when THIS order is ready.
 * Public (customers have no account); the order UUID is the capability.
 */
export async function POST(request: NextRequest) {
  if (!isPushConfigured()) {
    return NextResponse.json({ error: 'Las notificaciones no están disponibles' }, { status: 503 });
  }
  if (!rateLimit(`push-sub:${clientIp(request.headers)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Demasiados intentos, espera un momento' }, { status: 429 });
  }

  let orderId: string, endpoint: string, p256dh: string, auth: string;
  try {
    const body = await request.json();
    orderId = body.orderId;
    endpoint = body.subscription?.endpoint;
    p256dh = body.subscription?.keys?.p256dh;
    auth = body.subscription?.keys?.auth;
    if (!UUID_RE.test(orderId) || !isAllowedPushEndpoint(endpoint)) throw new Error('invalid');
    if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100) throw new Error('invalid');
  } catch {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const service = createServiceSupabaseClient();
  const { data: order } = await (service as any)
    .from('orders').select('id, status, tenant_id').eq('id', orderId).single();
  if (!order || order.status === 'Entregado' || order.status === 'Listo') {
    return NextResponse.json({ error: 'Este pedido ya no admite avisos' }, { status: 409 });
  }

  const { data: tenant } = await (service as any)
    .from('tenants')
    .select('id, plan_id, subscription_status, trial_ends_at, subscription_expires_at')
    .eq('id', order.tenant_id)
    .single();
  if (!tenant || !notificationsAllowed(tenant)) {
    return NextResponse.json({ error: 'Este local no tiene avisos activados' }, { status: 403 });
  }

  const { count } = await (service as any)
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId);
  if ((count ?? 0) >= MAX_SUBS_PER_ORDER) {
    return NextResponse.json({ error: 'Límite de dispositivos alcanzado' }, { status: 409 });
  }

  const { error } = await (service as any)
    .from('push_subscriptions')
    .upsert({ order_id: orderId, endpoint, p256dh, auth }, { onConflict: 'endpoint' });
  if (error) {
    console.error('push subscribe failed:', error.message);
    return NextResponse.json({ error: 'No se pudo registrar el aviso' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

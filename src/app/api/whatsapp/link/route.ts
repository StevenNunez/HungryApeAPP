import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { buildWhatsAppLink, isWhatsAppConfigured, newLinkToken } from '@/lib/whatsapp';
import { notificationsAllowed } from '@/lib/notify';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/whatsapp/link   { orderId }
 * Returns the wa.me URL the customer opens to start the (free) 24h conversation.
 */
export async function POST(request: NextRequest) {
  if (!isWhatsAppConfigured()) {
    return NextResponse.json({ error: 'WhatsApp no está disponible' }, { status: 503 });
  }
  if (!rateLimit(`wa-link:${clientIp(request.headers)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Demasiados intentos, espera un momento' }, { status: 429 });
  }

  let orderId: string;
  try {
    orderId = (await request.json()).orderId;
    if (!UUID_RE.test(orderId)) throw new Error('invalid');
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
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

  // Reuse the code if this order already has an un-notified link
  const { data: existing } = await (service as any)
    .from('whatsapp_links')
    .select('token')
    .eq('order_id', orderId)
    .is('notified_at', null)
    .limit(1);
  let token: string | undefined = existing?.[0]?.token;

  if (!token) {
    token = newLinkToken();
    const { error } = await (service as any).from('whatsapp_links').insert({ order_id: orderId, token });
    if (error) {
      console.error('whatsapp link insert failed:', error.message);
      return NextResponse.json({ error: 'No se pudo generar el enlace' }, { status: 500 });
    }
  }

  return NextResponse.json({ url: buildWhatsAppLink(token) });
}

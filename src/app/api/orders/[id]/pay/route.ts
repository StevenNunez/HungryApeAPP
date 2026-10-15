import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { appBaseUrl, createOrderPreference, getSellerAccessToken, isMarketplaceConfigured } from '@/lib/mp-seller';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/orders/:id/pay
 * Creates (or re-creates) the Mercado Pago checkout for an online-payment order, in the
 * BUSINESS' own account. Public: the customer has no account and the order UUID is the
 * capability. The amount always comes from the database, never from the request.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  if (!isMarketplaceConfigured()) return NextResponse.json({ error: 'Pagos online no disponibles' }, { status: 503 });

  if (!rateLimit(`order-pay:${clientIp(request.headers)}`, 15, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Demasiados intentos, espera un momento' }, { status: 429 });
  }

  const service = createServiceSupabaseClient();
  const { data: order } = await (service as any)
    .from('orders')
    .select('id, tenant_id, status, payment_method, total, short_id, pickup_code, paid_online')
    .eq('id', id)
    .single();
  if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  if (order.payment_method !== 'online') return NextResponse.json({ error: 'Este pedido no es de pago online' }, { status: 409 });
  if (order.paid_online || order.status !== 'Por Pagar') {
    return NextResponse.json({ error: 'Este pedido ya está pagado' }, { status: 409 });
  }

  const { data: tenant } = await (service as any)
    .from('tenants').select('id, slug, name').eq('id', order.tenant_id).single();
  const token = tenant ? await getSellerAccessToken(tenant.id) : null;
  if (!tenant || !token) return NextResponse.json({ error: 'El local no tiene pagos online activos' }, { status: 409 });

  try {
    const base = appBaseUrl(new URL(request.url).origin);
    const url = await createOrderPreference({
      accessToken: token,
      orderId: order.id,
      tenantId: tenant.id,
      title: `Pedido ${order.short_id ? '#' + order.short_id : ''} — ${tenant.name}`.replace(/\s+/g, ' ').trim(),
      total: Number(order.total),
      baseUrl: base,
      backUrl: `${base}/m/${tenant.slug}/pedido/${order.id}?code=${order.pickup_code}`,
    });
    return NextResponse.json({ url });
  } catch (err: any) {
    console.error('order pay failed:', err?.message ?? err);
    return NextResponse.json({ error: 'No se pudo iniciar el pago' }, { status: 502 });
  }
}

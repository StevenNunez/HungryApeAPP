import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { fetchSellerPayment, getSellerAccessToken } from '@/lib/mp-seller';
import { verifyMercadoPagoSignature } from '@/lib/mp-signature';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/mercadopago/orders-webhook?tenant=<id>
 * Payment notifications for CUSTOMER orders paid online (separate from the subscription
 * webhook). The body is never trusted: the payment is fetched from Mercado Pago with the
 * business' own token, and must match the order's total before it is marked paid.
 */
export async function POST(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenant');
  if (!tenantId || !UUID_RE.test(tenantId)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const dataId = String(body?.data?.id ?? '');
  if (!dataId || (body?.type && body.type !== 'payment')) return NextResponse.json({ received: true });

  const secret = process.env.MP_MARKETPLACE_WEBHOOK_SECRET || process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (verifyMercadoPagoSignature(request, dataId, secret) === 'invalid') {
    console.warn(`⚠️  Orders webhook rejected: invalid signature (tenant=${tenantId})`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const token = await getSellerAccessToken(tenantId);
    if (!token) return NextResponse.json({ received: true });

    const payment = await fetchSellerPayment(token, dataId);
    if (payment.status !== 'approved') return NextResponse.json({ received: true });

    let ref: { orderId?: string; tenantId?: string } = {};
    try { ref = JSON.parse(payment.external_reference || '{}'); } catch { /* ignore */ }
    if (!ref.orderId || ref.tenantId !== tenantId) return NextResponse.json({ received: true });

    const service = createServiceSupabaseClient();
    const { data: order } = await (service as any)
      .from('orders')
      .select('id, tenant_id, status, total, payment_method, paid_online')
      .eq('id', ref.orderId)
      .single();

    if (!order || order.tenant_id !== tenantId || order.payment_method !== 'online') {
      return NextResponse.json({ received: true });
    }
    if (order.paid_online) return NextResponse.json({ received: true }); // idempotent
    if (Number(payment.transaction_amount ?? 0) < Number(order.total)) {
      console.warn(`⚠️  Payment ${payment.id} amount ${payment.transaction_amount} < order total ${order.total} — ignored`);
      return NextResponse.json({ received: true });
    }

    const { error } = await (service as any)
      .from('orders')
      .update({
        paid_online: true,
        online_payment_id: String(payment.id),
        // A paid order goes straight to the kitchen queue
        ...(order.status === 'Por Pagar' ? { status: 'Pendiente' } : {}),
      })
      .eq('id', order.id);
    if (error) throw error;

    console.log(`✅ Order ${order.id} paid online`);
    return NextResponse.json({ received: true });
  } catch (err: any) {
    // 500 → Mercado Pago retries (the update above is idempotent)
    console.error('orders webhook error:', err?.message ?? err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

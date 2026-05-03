import { NextRequest, NextResponse } from 'next/server';
import { Payment } from 'mercadopago';
import { mercadoPagoClient } from '@/lib/mercadopago';
import { createServiceSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/mercadopago/sync-payment
 * Body: { paymentId: string }
 *
 * Manually syncs a Checkout Pro payment with Supabase.
 * Use this when the automatic webhook didn't fire (e.g., ngrok was offline).
 */
export async function POST(request: NextRequest) {
  try {
    const { paymentId } = await request.json();
    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId es requerido' }, { status: 400 });
    }

    const paymentApi = new Payment(mercadoPagoClient);
    const paymentData = await paymentApi.get({ id: String(paymentId) });

    console.log('🔍 Sync payment:', paymentId, '→ status:', paymentData.status);

    if (paymentData.status !== 'approved') {
      return NextResponse.json({
        error: `El pago no está aprobado. Estado actual: ${paymentData.status}`,
      }, { status: 400 });
    }

    let tenantId: string | null = null;
    let userId: string | null = null;
    let planId: string | null = null;

    try {
      const ref = JSON.parse(paymentData.external_reference || '{}');
      tenantId = ref.tenantId;
      userId = ref.userId;
      planId = ref.planId;
    } catch {}

    // Fallback: look up tenant by userId
    if (!tenantId && userId) {
      const supabase = createServiceSupabaseClient();
      const { data } = await (supabase.from('tenants') as any)
        .select('id')
        .eq('owner_id', userId)
        .single();
      tenantId = (data as any)?.id ?? null;
    }

    if (!tenantId || !planId) {
      return NextResponse.json({
        error: 'No se pudo resolver el tenant. Verifica que el external_reference tenga userId o tenantId.',
        external_reference: paymentData.external_reference,
      }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const { error } = await (supabase.from('tenants') as any)
      .update({
        subscription_status: 'active',
        subscription_plan: planId,
        plan_id: planId,
        subscription_payment_id: String(paymentData.id),
        subscription_updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      tenantId,
      planId,
      paymentId: paymentData.id,
      message: `Tenant ${tenantId} activado en plan ${planId}`,
    });
  } catch (error: any) {
    console.error('Sync payment error:', error?.cause ?? error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

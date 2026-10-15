import { NextRequest, NextResponse } from 'next/server';
import { Payment } from 'mercadopago';
import { mercadoPagoClient, SUBSCRIPTION_PLANS, type PlanId } from '@/lib/mercadopago';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { activateTenant, parseReference } from '@/lib/billing';

const MAX_PAYMENT_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * POST /api/mercadopago/sync-payment
 * Body: { paymentId: string }
 *
 * Manual rescue when the webhook did not fire. Requires a logged-in owner and only
 * applies a recent, approved payment that belongs to THEIR business.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { paymentId } = await request.json();
    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId es requerido' }, { status: 400 });
    }

    const paymentApi = new Payment(mercadoPagoClient);
    const paymentData = await paymentApi.get({ id: String(paymentId) });

    if (paymentData.status !== 'approved') {
      return NextResponse.json({
        error: `El pago no está aprobado. Estado actual: ${paymentData.status}`,
      }, { status: 400 });
    }

    const paidAt = paymentData.date_approved ? new Date(paymentData.date_approved) : null;
    if (!paidAt || Date.now() - paidAt.getTime() > MAX_PAYMENT_AGE_MS) {
      return NextResponse.json({ error: 'El pago es demasiado antiguo para sincronizarlo.' }, { status: 400 });
    }

    const ref = parseReference(paymentData.external_reference);
    const plan = ref.planId ? SUBSCRIPTION_PLANS[ref.planId as PlanId] : undefined;
    if (!plan) {
      return NextResponse.json({ error: 'Plan inválido en el pago.' }, { status: 400 });
    }
    if (Number(paymentData.transaction_amount ?? 0) < plan.priceAnnualTotal) {
      return NextResponse.json({ error: 'El monto del pago no corresponde al plan.' }, { status: 400 });
    }

    // The business to activate is always the caller's own, and the payment must be theirs
    const { data: tenant } = await supabase.from('tenants')
      .select('id')
      .eq('owner_id', user.id)
      .single();
    if (!tenant) {
      return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 });
    }
    if ((ref.tenantId && ref.tenantId !== tenant.id) || (ref.userId && ref.userId !== user.id)) {
      return NextResponse.json({ error: 'Este pago no pertenece a tu negocio.' }, { status: 403 });
    }

    await activateTenant(tenant.id, plan.id, String(paymentData.id), { annual: true, paidAt });

    return NextResponse.json({ ok: true, planId: plan.id, paymentId: paymentData.id });
  } catch (error: any) {
    console.error('Sync payment error:', error?.cause ?? error);
    return NextResponse.json({ error: 'No se pudo sincronizar el pago' }, { status: 500 });
  }
}

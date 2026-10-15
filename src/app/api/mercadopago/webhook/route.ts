import { NextRequest, NextResponse } from 'next/server';
import { Payment, PreApproval } from 'mercadopago';
import { mercadoPagoClient, SUBSCRIPTION_PLANS, type PlanId as BillingPlanId } from '@/lib/mercadopago';
import { activateTenant, resolveTenantId, parseReference, storePendingActivation } from '@/lib/billing';
import { verifyMercadoPagoSignature } from '@/lib/mp-signature';

// ─── Route handlers ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const dataId: string = String(body?.data?.id ?? '');
  const eventType: string = body?.type ?? '';
  if (!dataId) return NextResponse.json({ received: true });

  if (verifyMercadoPagoSignature(request, dataId) === 'invalid') {
    console.warn(`⚠️  MP webhook rejected: invalid signature (type=${eventType}, id=${dataId})`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  console.log(`📦 MP webhook: type=${eventType} id=${dataId}`);

  try {
    // ── Recurring subscription event (PreApproval) ──────────────────────────
    if (eventType === 'subscription_preapproval') {
      const preapprovalApi = new PreApproval(mercadoPagoClient);
      const subData = await preapprovalApi.get({ id: dataId });

      if (subData.status === 'authorized' || subData.status === 'approved') {
        const ref = parseReference(subData.external_reference);
        const tenantId = await resolveTenantId(ref.tenantId, ref.userId);

        if (tenantId && ref.planId && ref.planId in SUBSCRIPTION_PLANS) {
          await activateTenant(tenantId, ref.planId, String(subData.id), { annual: false });
        } else if (!tenantId && ref.isPreRegistration && ref.email && ref.planId && ref.planId in SUBSCRIPTION_PLANS) {
          // Paid before creating an account: park it until that email's owner logs in
          await storePendingActivation({
            email: ref.email,
            planId: ref.planId,
            paymentId: String(subData.id),
            annual: false,
            paidAt: new Date(),
          });
        } else {
          console.warn('⚠️  Subscription approved but could not resolve tenant/plan. Ref:', subData.external_reference);
        }
      }
    }

    // ── One-time payment event (Checkout Pro annual) ─────────────────────────
    else if (eventType === 'payment') {
      const paymentApi = new Payment(mercadoPagoClient);
      const paymentData = await paymentApi.get({ id: dataId });

      if (paymentData.status === 'approved') {
        const ref = parseReference(paymentData.external_reference);
        const plan = ref.planId ? SUBSCRIPTION_PLANS[ref.planId as BillingPlanId] : undefined;

        if (!plan) {
          console.warn('⚠️  Payment approved with unknown plan. Ref:', paymentData.external_reference);
        } else if (Number(paymentData.transaction_amount ?? 0) < plan.priceAnnualTotal) {
          console.warn(
            `⚠️  Payment ${paymentData.id} amount ${paymentData.transaction_amount} < ${plan.priceAnnualTotal} for plan ${plan.id} — ignored`,
          );
        } else {
          const tenantId = await resolveTenantId(ref.tenantId, ref.userId);
          const paidAt = paymentData.date_approved ? new Date(paymentData.date_approved) : new Date();
          if (tenantId) {
            await activateTenant(tenantId, plan.id, String(paymentData.id), { annual: true, paidAt });
          } else if (ref.isPreRegistration && ref.email) {
            // Paid before creating an account: park it until that email's owner logs in
            await storePendingActivation({
              email: ref.email,
              planId: plan.id,
              paymentId: String(paymentData.id),
              annual: true,
              paidAt,
            });
          } else {
            console.warn('⚠️  Payment approved but could not resolve tenantId. Ref:', paymentData.external_reference);
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    // 500 → Mercado Pago retries. Activation is idempotent, so a retry is safe.
    console.error('Webhook processing error:', error?.cause ?? error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

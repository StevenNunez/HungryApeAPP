import { NextRequest, NextResponse } from 'next/server';
import { Preference, PreApproval } from 'mercadopago';
import { mercadoPagoClient, SUBSCRIPTION_PLANS, PlanId } from '@/lib/mercadopago';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId, email, businessName, isPreRegistration, userId, isAnnual } = body;
    let { tenantId } = body;

    const plan = SUBSCRIPTION_PLANS[planId as PlanId];
    if (!plan) return NextResponse.json({ error: 'Plan inválido' }, { status: 400 });

    // Derive app URL from the request itself so it works with ngrok, production,
    // and localhost without changing env vars each time.
    const proto = request.headers.get('x-forwarded-proto') ?? 'http';
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? 'localhost:3000';
    const appUrl = `${proto}://${host}`;

    // If the user is logged in but tenantId was not provided, look it up server-side.
    if (userId && !tenantId) {
      const supabase = await createServerSupabaseClient();
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('owner_id', userId)
        .single();
      if (tenant) tenantId = (tenant as any).id;
    }

    const externalReference = JSON.stringify({
      tenantId: tenantId || null,
      userId: userId || null,
      planId,
      isAnnual: !!isAnnual,
      isPreRegistration: !!isPreRegistration,
      businessName: businessName || null,
      email: email || null,
    });

    // ─── ANNUAL: one-time payment via Checkout Pro (Preference) ───────────────
    if (isAnnual) {
      const successUrl = isPreRegistration
        ? `${appUrl}/login?mode=signup&payment_status=success&plan=${planId}&email=${encodeURIComponent(email || '')}&business=${encodeURIComponent(businessName || '')}`
        : `${appUrl}/suscripcion/exito?plan=${planId}`;

      const preference = new Preference(mercadoPagoClient);
      const result = await preference.create({
        body: {
          items: [
            {
              id: planId,
              title: `Plan ${plan.name} Hungry Ape — Anual (12 meses)`,
              quantity: 1,
              unit_price: plan.priceAnnualTotal,
              currency_id: 'CLP',
              description: plan.description,
            },
          ],
          payer: { email: email || undefined },
          back_urls: {
            success: successUrl,
            failure: isPreRegistration
              ? `${appUrl}/login?mode=signup&payment_status=failure`
              : `${appUrl}/suscripcion/error`,
            pending: isPreRegistration
              ? `${appUrl}/login?mode=signup&payment_status=pending`
              : `${appUrl}/suscripcion/pendiente?plan=${planId}`,
          },
          ...(appUrl.startsWith('https://') ? { auto_return: 'approved' as const } : {}),
          external_reference: externalReference,
          notification_url: `${appUrl}/api/mercadopago/webhook`,
        },
      });

      return NextResponse.json({
        preferenceId: result.id,
        initPoint: result.init_point,
        sandboxInitPoint: (result as any).sandbox_init_point,
      });
    }

    // ─── MONTHLY: recurring subscription via PreApproval ─────────────────────
    // Note: frequency_type 'years' is NOT supported in CLP — always use 'months'.
    // MP sandbox requires HTTPS for back_url; fall back to production URL on localhost.
    const httpsBase = appUrl.startsWith('https://')
      ? appUrl
      : (process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://') ? process.env.NEXT_PUBLIC_APP_URL : 'https://ape.teolabs.app');

    const preapproval = new PreApproval(mercadoPagoClient);
    const result = await preapproval.create({
      body: {
        reason: `Suscripción Plan ${plan.name} — Hungry Ape (Mensual)`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: plan.priceMonthly,
          currency_id: 'CLP',
        },
        payer_email: email || 'usuario@hungryape.com',
        back_url: isPreRegistration
          ? `${httpsBase}/login?mode=signup&payment_status=success&plan=${planId}&email=${encodeURIComponent(email || '')}&business=${encodeURIComponent(businessName || '')}`
          : `${httpsBase}/suscripcion/exito?plan=${planId}&type=subscription`,
        external_reference: externalReference,
        status: 'pending',
      },
    });

    return NextResponse.json({
      preapprovalId: result.id,
      initPoint: result.init_point,
      sandboxInitPoint: (result as any).sandbox_init_point,
    });
  } catch (error: any) {
    console.error('MP create-preference error:', error?.cause ?? error);
    return NextResponse.json(
      { error: `Error al generar el pago: ${error.message}` },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { Preference, PreApproval } from 'mercadopago';
import { mercadoPagoClient, SUBSCRIPTION_PLANS, PlanId } from '@/lib/mercadopago';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId, email, businessName, isPreRegistration, isAnnual } = body;
    let { tenantId, userId } = body;

    const plan = SUBSCRIPTION_PLANS[planId as PlanId];
    if (!plan) return NextResponse.json({ error: 'Plan inválido' }, { status: 400 });

    // In production the app URL is fixed by env (back_urls / notification_url must not be
    // steerable through request headers). Locally / behind ngrok it falls back to the request host.
    const proto = request.headers.get('x-forwarded-proto') ?? 'http';
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? 'localhost:3000';
    const appUrl = process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_URL
      ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
      : `${proto}://${host}`;

    // A checkout from inside the app is bound to the logged-in user's own business —
    // identity comes from the session, never from the request body.
    if (!isPreRegistration) {
      const supabase = await createServerSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Debes iniciar sesión para continuar.' }, { status: 401 });
      }
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('owner_id', user.id)
        .single();
      userId = user.id;
      tenantId = tenant?.id ?? null;
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

      const isSandbox = process.env.MERCADOPAGO_ACCESS_TOKEN?.startsWith('TEST-');
      const checkoutUrl = isSandbox
        ? ((result as any).sandbox_init_point || result.init_point)
        : result.init_point;

      return NextResponse.json({ preferenceId: result.id, checkoutUrl });
    }

    // ─── MONTHLY: recurring subscription via PreApproval ─────────────────────
    // Note: frequency_type 'years' is NOT supported in CLP — always use 'months'.
    // MP sandbox requires HTTPS for back_url; fall back to production URL on localhost.
    const httpsBase = appUrl.startsWith('https://')
      ? appUrl
      : (process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://') ? process.env.NEXT_PUBLIC_APP_URL : 'https://ape.teolabs.app');

    if (!email) {
      return NextResponse.json({ error: 'El correo es obligatorio para la suscripción mensual.' }, { status: 400 });
    }

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
        payer_email: email,
        back_url: isPreRegistration
          ? `${httpsBase}/login?mode=signup&payment_status=success&plan=${planId}&email=${encodeURIComponent(email || '')}&business=${encodeURIComponent(businessName || '')}`
          : `${httpsBase}/suscripcion/exito?plan=${planId}&type=subscription`,
        external_reference: externalReference,
        status: 'pending',
      },
    });

    const isSandbox = process.env.MERCADOPAGO_ACCESS_TOKEN?.startsWith('TEST-');
    const checkoutUrl = isSandbox
      ? ((result as any).sandbox_init_point || result.init_point)
      : result.init_point;

    return NextResponse.json({ preapprovalId: result.id, checkoutUrl });
  } catch (error: any) {
    console.error('MP create-preference error:', error?.cause ?? error);
    return NextResponse.json(
      { error: `Error al generar el pago: ${error.message}` },
      { status: 500 },
    );
  }
}

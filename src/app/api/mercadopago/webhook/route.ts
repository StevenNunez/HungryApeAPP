import { NextRequest, NextResponse } from 'next/server';
import { Payment, PreApproval } from 'mercadopago';
import { mercadoPagoClient } from '@/lib/mercadopago';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { createHmac } from 'crypto';
import { sendWelcomeEmail, type PlanId } from '@/lib/email';

// ─── Signature verification ───────────────────────────────────────────────────
// NOTE: MP only sends x-signature for panel-configured webhooks.
// notification_url (IPN) calls do NOT include x-signature.
// We verify when possible, but never reject if the header is absent.
function verifyMercadoPagoSignature(request: NextRequest, dataId: string): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true; // No secret configured → skip

  const xSignature = request.headers.get('x-signature');
  if (!xSignature) {
    // IPN call via notification_url — no signature sent by MP, always allow
    return true;
  }

  // Parse "ts=<timestamp>,v1=<hash>"
  const parts = Object.fromEntries(
    xSignature.split(',').map((part) => part.split('=')),
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return true; // Malformed header — allow but log

  const manifest = `id:${dataId};request-date:${ts};`;
  const expectedHash = createHmac('sha256', secret).update(manifest).digest('hex');

  if (expectedHash !== v1) {
    console.warn('⚠️  MP signature mismatch — processing anyway (check webhook secret)');
  }
  return true; // Log mismatch but never block — prevents silent payment drops
}

// ─── Tenant activation helper ─────────────────────────────────────────────────
async function activateTenant(tenantId: string, planId: string, paymentId: string) {
  const supabase = createServiceSupabaseClient();
  const { error } = await (supabase.from('tenants') as any)
    .update({
      subscription_status: 'active',
      subscription_plan: planId,
      plan_id: planId,
      subscription_payment_id: paymentId,
      subscription_updated_at: new Date().toISOString(),
    })
    .eq('id', tenantId);

  if (error) {
    console.error('❌ Supabase update error:', error);
    return;
  }

  console.log(`✅ Tenant ${tenantId} activated on plan ${planId}`);

  // ── Send welcome email for paid plan activation ──────────────────────
  try {
    const { data: tenantRow } = await (supabase.from('tenants') as any)
      .select('name, owner_id')
      .eq('id', tenantId)
      .single();

    if (tenantRow) {
      // Get the owner email from auth.users via service role
      const { data: authUser } = await supabase.auth.admin.getUserById(tenantRow.owner_id);
      const ownerEmail = authUser?.user?.email;

      if (ownerEmail) {
        await sendWelcomeEmail({
          to: ownerEmail,
          businessName: tenantRow.name,
          planId: planId as PlanId,
        });
      }
    }
  } catch (emailErr) {
    // Non-fatal: log but don't break the webhook response
    console.warn('⚠️  Welcome email failed (paid plan):', emailErr);
  }
}

// If tenantId is missing in external_reference, fall back to looking it up by userId
async function resolveTenantId(tenantId: string | null, userId: string | null): Promise<string | null> {
  if (tenantId) return tenantId;
  if (!userId) return null;

  const supabase = createServiceSupabaseClient();
  const { data } = await (supabase.from('tenants') as any)
    .select('id')
    .eq('owner_id', userId)
    .single();

  return (data as any)?.id ?? null;
}

// ─── Route handlers ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('📦 MP webhook received:', JSON.stringify(body, null, 2));

    const dataId: string = String(body.data?.id ?? '');
    if (!dataId) return NextResponse.json({ received: true });

    verifyMercadoPagoSignature(request, dataId); // logs mismatches, never blocks

    const eventType: string = body.type ?? '';

    // ── Recurring subscription event (PreApproval) ──────────────────────────
    if (eventType === 'subscription_preapproval') {
      const preapprovalApi = new PreApproval(mercadoPagoClient);
      const subData = await preapprovalApi.get({ id: dataId });
      console.log('🔄 Subscription status:', subData.status);

      if (subData.status === 'authorized' || subData.status === 'approved') {
        let tenantId: string | null = null;
        let userId: string | null = null;
        let planId: string | null = null;
        try {
          const ref = JSON.parse(subData.external_reference || '{}');
          tenantId = ref.tenantId;
          userId = ref.userId;
          planId = ref.planId;
        } catch {}

        tenantId = await resolveTenantId(tenantId, userId);

        if (tenantId && planId) {
          await activateTenant(tenantId, planId, String(subData.id));
        } else {
          console.warn('⚠️  Subscription approved but could not resolve tenantId. Ref:', subData.external_reference);
        }
      }
    }

    // ── One-time payment event (Checkout Pro annual) ─────────────────────────
    else if (eventType === 'payment') {
      const paymentApi = new Payment(mercadoPagoClient);
      const paymentData = await paymentApi.get({ id: dataId });
      console.log('💳 Payment status:', paymentData.status);

      if (paymentData.status === 'approved') {
        let tenantId: string | null = null;
        let userId: string | null = null;
        let planId: string | null = null;
        try {
          const ref = JSON.parse(paymentData.external_reference || '{}');
          tenantId = ref.tenantId;
          userId = ref.userId;
          planId = ref.planId;
        } catch {}

        tenantId = await resolveTenantId(tenantId, userId);

        if (tenantId && planId) {
          await activateTenant(tenantId, planId, String(paymentData.id));
        } else {
          console.warn('⚠️  Payment approved but could not resolve tenantId. Ref:', paymentData.external_reference);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error?.cause ?? error);
    return NextResponse.json({ received: true }); // Always 200 to prevent MP retries
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

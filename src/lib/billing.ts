import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { sendWelcomeEmail, type PlanId } from '@/lib/email';

// ─── Tenant activation helper ─────────────────────────────────────────────────
// Throws on database errors so callers (webhook) answer 500 and Mercado Pago retries.
export async function activateTenant(
  tenantId: string,
  planId: string,
  paymentId: string,
  opts: { annual: boolean; paidAt?: Date },
) {
  const supabase = createServiceSupabaseClient();

  const { data: current, error: readError } = await supabase.from('tenants')
    .select('subscription_payment_id')
    .eq('id', tenantId)
    .single();
  if (readError) throw readError;

  // One-off (annual) payments are idempotent: a payment id can activate a tenant only once.
  // This also stops an old approved payment from re-activating a cancelled / expired tenant.
  if (opts.annual && current?.subscription_payment_id === paymentId) {
    console.log(`ℹ️  Payment ${paymentId} already applied to tenant ${tenantId}`);
    return;
  }

  // Annual = fixed 12-month term from the payment date; monthly is governed by the PreApproval state
  const expiresAt = opts.annual ? new Date(opts.paidAt ?? new Date()) : null;
  if (expiresAt) expiresAt.setMonth(expiresAt.getMonth() + 12);

  const { error } = await supabase.from('tenants')
    .update({
      subscription_status: 'active',
      subscription_plan: planId,
      plan_id: planId,
      subscription_payment_id: paymentId,
      subscription_updated_at: new Date().toISOString(),
      subscription_expires_at: expiresAt ? expiresAt.toISOString() : null,
    })
    .eq('id', tenantId);

  if (error) throw error;

  console.log(`✅ Tenant ${tenantId} activated on plan ${planId}${opts.annual ? ' (annual)' : ''}`);

  // ── Send welcome email for paid plan activation (non-fatal) ───────────
  try {
    const { data: tenantRow } = await supabase.from('tenants')
      .select('name, owner_id')
      .eq('id', tenantId)
      .single();

    if (tenantRow) {
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
    console.warn('⚠️  Welcome email failed (paid plan):', emailErr);
  }
}

// If tenantId is missing in external_reference, fall back to looking it up by userId
export async function resolveTenantId(tenantId: string | null, userId: string | null): Promise<string | null> {
  if (tenantId) return tenantId;
  if (!userId) return null;

  const supabase = createServiceSupabaseClient();
  const { data } = await supabase.from('tenants')
    .select('id')
    .eq('owner_id', userId)
    .single();

  return data?.id ?? null;
}

export function parseReference(raw: string | null | undefined) {
  try {
    const ref = JSON.parse(raw || '{}');
    return {
      tenantId: (ref.tenantId as string | null) ?? null,
      userId: (ref.userId as string | null) ?? null,
      planId: (ref.planId as string | null) ?? null,
      email: (ref.email as string | null) ?? null,
      isPreRegistration: !!ref.isPreRegistration,
    };
  } catch {
    return { tenantId: null, userId: null, planId: null, email: null, isPreRegistration: false };
  }
}

// ─── Pay-before-signup ("pre-registration") ──────────────────────────────────
// A customer can pay on the landing page before having an account. The webhook then
// finds no tenant to activate, so the confirmed payment is parked here (keyed by the
// email used at checkout) and claimed when that email's owner logs in.

export async function storePendingActivation(p: {
  email: string;
  planId: string;
  paymentId: string;
  annual: boolean;
  paidAt: Date;
}) {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from('pending_activations').upsert(
    {
      email: p.email.trim().toLowerCase(),
      plan_id: p.planId,
      payment_id: p.paymentId,
      annual: p.annual,
      paid_at: p.paidAt.toISOString(),
    },
    { onConflict: 'payment_id', ignoreDuplicates: true },
  );
  if (error) throw error;
  console.log(`🕓 Payment ${p.paymentId} parked (pre-registration)`);
}

/**
 * Applies the newest unclaimed pre-registration payment for this user's (verified)
 * email to their tenant. Idempotent. Returns the plan activated, or null.
 */
export async function claimPendingActivation(userId: string, email: string): Promise<string | null> {
  const supabase = createServiceSupabaseClient();

  const { data: pending } = await supabase.from('pending_activations')
    .select('id, plan_id, payment_id, annual, paid_at')
    .eq('email', email.trim().toLowerCase())
    .is('claimed_at', null)
    .order('paid_at', { ascending: false })
    .limit(1);

  const row = pending?.[0];
  if (!row) return null;

  const tenantId = await resolveTenantId(null, userId);
  if (!tenantId) return null;

  // An annual payment older than its 12-month term is no longer worth activating
  if (row.annual) {
    const end = new Date(row.paid_at);
    end.setMonth(end.getMonth() + 12);
    if (end < new Date()) return null;
  }

  await activateTenant(tenantId, row.plan_id, row.payment_id, {
    annual: row.annual,
    paidAt: new Date(row.paid_at),
  });

  await supabase.from('pending_activations')
    .update({ claimed_at: new Date().toISOString(), claimed_by: userId })
    .eq('id', row.id);

  return row.plan_id;
}

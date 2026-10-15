import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { claimPendingActivation } from '@/lib/billing';

/**
 * POST /api/billing/claim
 *
 * Applies a payment made BEFORE signing up (pre-registration checkout) to the
 * logged-in user's business. The email must be verified, so nobody can claim a
 * payment made with somebody else's address. Idempotent.
 */
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    if (!user.email_confirmed_at) {
      return NextResponse.json({ claimed: null, reason: 'email_not_confirmed' });
    }

    const planId = await claimPendingActivation(user.id, user.email);
    return NextResponse.json({ claimed: planId });
  } catch (err: any) {
    console.error('[billing/claim]', err?.message ?? err);
    return NextResponse.json({ error: 'No se pudo aplicar el pago' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendWelcomeEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';

/**
 * POST /api/email/welcome
 *
 * Called right after signup / business creation. Only the logged-in user can trigger
 * it, and it always goes to THEIR own address (never an address taken from the body),
 * so it cannot be used as a spam relay. Paid-plan welcomes are sent by the Mercado Pago
 * webhook, never from here.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // One welcome per user per hour is plenty
    if (!rateLimit(`welcome:${user.id}`, 1, 60 * 60 * 1000)) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { businessName } = await request.json();
    if (typeof businessName !== 'string' || !businessName.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await sendWelcomeEmail({
      to: user.email,
      businessName: businessName.trim().slice(0, 80),
      planId: 'gratis',
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('❌ Welcome email error:', error);
    return NextResponse.json({ error: 'No se pudo enviar el correo' }, { status: 500 });
  }
}

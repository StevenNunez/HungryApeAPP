import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase/server';
import { PreApproval } from 'mercadopago';
import { mercadoPagoClient } from '@/lib/mercadopago';

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const serviceClient = createServiceSupabaseClient();

    // Fetch current tenant
    const { data: tenant, error: fetchError } = await (serviceClient.from('tenants') as any)
      .select('id, subscription_status, subscription_payment_id')
      .eq('owner_id', user.id)
      .single();

    if (fetchError || !tenant) {
      return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 });
    }

    if (tenant.subscription_status === 'cancelled') {
      return NextResponse.json({ error: 'La suscripción ya está cancelada' }, { status: 400 });
    }

    // If there's a Mercado Pago PreApproval ID, cancel it via API
    const mpId = tenant.subscription_payment_id as string | null;
    if (mpId && !mpId.startsWith('annual_')) {
      try {
        const preapproval = new PreApproval(mercadoPagoClient);
        await preapproval.update({
          id: mpId,
          body: { status: 'cancelled' },
        });
      } catch (mpErr: any) {
        // Log but don't block — cancel in DB regardless
        console.warn('MP PreApproval cancel failed:', mpErr?.message);
      }
    }

    // Mark tenant as cancelled in DB
    const { error: updateError } = await (serviceClient.from('tenants') as any)
      .update({
        subscription_status: 'cancelled',
        subscription_updated_at: new Date().toISOString(),
      })
      .eq('id', tenant.id);

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[subscription/cancel]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

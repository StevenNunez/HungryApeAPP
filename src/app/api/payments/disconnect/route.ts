import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase/server';

/** POST /api/payments/disconnect — removes the stored Mercado Pago account of the logged-in business. */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: tenant } = await supabase.from('tenants').select('id').eq('owner_id', user.id).single();
  if (!tenant) return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 });

  const { error } = await (createServiceSupabaseClient() as any)
    .from('tenant_payment_accounts').delete().eq('tenant_id', tenant.id);
  if (error) return NextResponse.json({ error: 'No se pudo desconectar' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

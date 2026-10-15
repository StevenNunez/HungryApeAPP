import { NextRequest, NextResponse, after } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase/server';
import { DEMO_TENANT_ID, notifyOrderReady } from '@/lib/notify';

const FLOW = ['Por Pagar', 'Pendiente', 'En preparación', 'Listo', 'Entregado'] as const;
type Status = (typeof FLOW)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/orders/:id/status   { status }
 *
 * The kitchen moves an order forward through its states. Done on the server (instead of
 * straight from the browser) so that reaching "Listo" can trigger the customer alerts.
 * Only the business owner may do it — except the public demo, whose kitchen is anonymous.
 * Orders can only move forward.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  let status: Status;
  try {
    const body = await request.json();
    if (!FLOW.includes(body?.status)) throw new Error('bad status');
    status = body.status;
  } catch {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }

  const service = createServiceSupabaseClient();
  const { data: order } = await (service as any)
    .from('orders')
    .select('id, status, tenant_id')
    .eq('id', id)
    .single();
  if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

  if (order.tenant_id !== DEMO_TENANT_ID) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data: tenant } = await (service as any)
      .from('tenants')
      .select('owner_id')
      .eq('id', order.tenant_id)
      .single();
    if (!tenant || tenant.owner_id !== user.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
  }

  const from = FLOW.indexOf(order.status);
  const to = FLOW.indexOf(status);
  if (to < from) {
    return NextResponse.json({ error: 'Un pedido no puede volver a un estado anterior' }, { status: 409 });
  }
  if (to === from) return NextResponse.json({ ok: true, status, unchanged: true });

  const { error } = await (service as any).from('orders').update({ status }).eq('id', id);
  if (error) {
    console.error('Order status update failed:', error.message);
    return NextResponse.json({ error: 'No se pudo actualizar el pedido' }, { status: 500 });
  }

  // Customer alerts run after the response so the kitchen UI is never slowed down by them
  if (status === 'Listo') after(() => notifyOrderReady(id));

  return NextResponse.json({ ok: true, status });
}

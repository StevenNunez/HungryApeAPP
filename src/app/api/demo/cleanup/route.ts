import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

const DEMO_TENANT_ID = 'a0000000-0000-0000-0000-000000000001';

export async function POST() {
  // Public endpoint (the /demo page calls it on load): throttle so it cannot be
  // hammered to wipe a demo someone else is in the middle of using.
  if (!rateLimit('demo-cleanup', 1, 15_000)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const supabase = createServiceSupabaseClient();

    // Elimina TODOS los pedidos demo (order_items y order_item_modifiers se borran en cascada)
    // Esto garantiza que cada visita a /demo empiece desde cero
    const { count: deleted, error: deleteError } = await supabase
      .from('orders')
      .delete({ count: 'exact' })
      .eq('tenant_id', DEMO_TENANT_ID);

    if (deleteError) throw deleteError;

    // Restaura el stock de los productos demo para que el menú siga funcionando
    // (el trigger decrement_stock baja el stock al crear order_items, pero no lo restaura al borrar)
    const { error: stockError } = await supabase
      .from('products')
      .update({ stock: 99, is_available: true })
      .eq('tenant_id', DEMO_TENANT_ID)
      .eq('is_archived', false)
      .neq('name', 'Hot Dog Especial'); // Mantener este como "Agotado" para demo

    if (stockError) throw stockError;

    return NextResponse.json({ ok: true, deleted: deleted ?? 0 });
  } catch (err: any) {
    console.error('[demo/cleanup]', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

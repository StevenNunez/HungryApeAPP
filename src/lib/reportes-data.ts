import { createClient } from '@/lib/supabase/client';
import { fetchProductPrivate, withPrivate } from '@/lib/product-private';
import { rangeStart, type ReportRange } from '@/lib/analytics';

/**
 * Inventory & reports queries (browser client, RLS: owner and manager).
 * Every function throws on a network/DB error.
 */

const PAGE = 1000; // Supabase returns at most 1000 rows per request

/** Reads every page of a query (Supabase caps a single response at 1000 rows). */
export async function fetchAll<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Active products with their private cost / restock target merged in. */
export async function fetchInventory(tenantId: string): Promise<any[]> {
  const [{ data, error }, priv] = await Promise.all([
    createClient().from('products').select('*').eq('tenant_id', tenantId).eq('is_archived', false).order('category', { ascending: true }),
    fetchProductPrivate(tenantId).catch(() => ({})),
  ]);
  if (error) throw error;
  return withPrivate(data || [], priv);
}

/** Paid orders and their lines for the range (Pro also gets timestamps and frozen unit cost). */
export async function fetchReportData(tenantId: string, range: ReportRange, isPro: boolean) {
  const supabase = createClient();
  const since = rangeStart(range);
  const orderCols = isPro
    ? 'id, total, status, payment_method, created_at, confirmed_at, preparing_at, ready_at'
    : 'id, total, status, payment_method, created_at';
  const itemCols = isPro
    ? 'order_id, product_id, product_name, quantity, price, unit_cost, orders!inner(tenant_id, status, created_at)'
    : 'order_id, product_id, product_name, quantity, price, orders!inner(tenant_id, status, created_at)';

  const [orders, items] = await Promise.all([
    fetchAll((from, to) => {
      let q = supabase.from('orders').select(orderCols)
        .eq('tenant_id', tenantId).not('status', 'in', '("Por Pagar","Cancelado")')
        .order('created_at', { ascending: true }).range(from, to);
      if (since) q = q.gte('created_at', since);
      return q as any;
    }),
    fetchAll((from, to) => {
      let q = supabase.from('order_items').select(itemCols)
        .eq('orders.tenant_id', tenantId).not('orders.status', 'in', '("Por Pagar","Cancelado")')
        .order('id', { ascending: true }).range(from, to);
      if (since) q = q.gte('orders.created_at', since);
      return q as any;
    }),
  ]);
  return { orders, items };
}

export async function setStock(productId: string, stock: number): Promise<void> {
  const { error } = await createClient().from('products').update({ stock, is_available: stock > 0 }).eq('id', productId);
  if (error) throw error;
}

export async function setAvailability(productId: string, available: boolean): Promise<void> {
  const { error } = await createClient().from('products').update({ is_available: available }).eq('id', productId);
  if (error) throw error;
}

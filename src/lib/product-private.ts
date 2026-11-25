import { createClient } from '@/lib/supabase/client';

/**
 * Owner-only product data (cost, restock target). It lives in `product_private`
 * instead of `products` because products are publicly readable (menu) and travel
 * over Realtime: customers must never see a business's costs.
 */
export interface ProductPrivate {
  cost: number | null;
  restock_target: number | null;
}

/** Costs of a tenant's products keyed by product id (RLS: only the owner gets rows). */
export async function fetchProductPrivate(tenantId: string): Promise<Record<string, ProductPrivate>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('product_private')
    .select('product_id, cost, restock_target')
    .eq('tenant_id', tenantId);
  if (error) throw new Error('No se pudieron cargar los costos');
  const map: Record<string, ProductPrivate> = {};
  for (const row of data || []) {
    map[row.product_id] = {
      cost: row.cost === null ? null : Number(row.cost),
      restock_target: row.restock_target,
    };
  }
  return map;
}

/** Products with their private fields merged in (null when never set). */
export function withPrivate<T extends { id: string }>(
  products: T[],
  priv: Record<string, ProductPrivate>,
): (T & ProductPrivate)[] {
  return products.map(p => ({ ...p, cost: priv[p.id]?.cost ?? null, restock_target: priv[p.id]?.restock_target ?? null }));
}

/** Splits an edited product into its public columns and its private ones. */
export function splitPrivate<T extends Record<string, any>>(product: T) {
  const { cost, restock_target, ...publicFields } = product;
  return {
    publicFields,
    privateFields: {
      cost: cost === undefined || cost === '' ? null : cost,
      restock_target: restock_target === undefined || restock_target === '' ? null : restock_target,
    } as ProductPrivate,
  };
}

export async function saveProductPrivate(tenantId: string, productId: string, fields: ProductPrivate) {
  const supabase = createClient();
  const { error } = await supabase
    .from('product_private')
    .upsert(
      { product_id: productId, tenant_id: tenantId, ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'product_id' },
    );
  if (error) throw new Error('No se pudo guardar el costo');
}

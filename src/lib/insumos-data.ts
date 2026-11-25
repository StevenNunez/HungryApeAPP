import { createClient } from '@/lib/supabase/client';
import type { RecipeLine, Supply, SupplyMovement, SupplyUnit } from '@/lib/insumos';

/**
 * Supplies queries (browser client; RLS: owner and manager of a Pro business).
 * Every function throws on a network/DB error.
 */

const db = () => createClient() as any;
const fail = (what: string, error: { message: string }): never => {
  throw Object.assign(new Error(`${what}: ${error.message}`), { cause: error });
};

export async function fetchSupplies(tenantId: string): Promise<Supply[]> {
  const { data, error } = await db().from('supplies').select('*').eq('tenant_id', tenantId).eq('is_archived', false).order('name');
  if (error) fail('insumos', error);
  return (data ?? []).map((s: any) => ({
    ...s,
    stock: Number(s.stock),
    min_stock: Number(s.min_stock),
    target_stock: s.target_stock === null ? null : Number(s.target_stock),
    cost_per_unit: s.cost_per_unit === null ? null : Number(s.cost_per_unit),
  }));
}

export interface SupplyInput {
  name: string;
  unit: SupplyUnit;
  min_stock: number;
  target_stock: number | null;
  cost_per_unit: number | null;
}

/** New supply; its starting stock is registered as a count, so it shows in the history. */
export async function createSupply(tenantId: string, input: SupplyInput, initialStock: number): Promise<void> {
  const { data, error } = await db().from('supplies').insert({ tenant_id: tenantId, ...input, stock: 0 }).select('id').single();
  if (error) {
    if (error.code === '23505') throw new Error('Ya tienes un insumo con ese nombre.');
    fail('crear insumo', error);
  }
  if (initialStock > 0) await recordMovement(data.id, 'ajuste', initialStock, null, 'Stock inicial');
}

export async function updateSupply(id: string, input: Partial<SupplyInput>): Promise<void> {
  const { error } = await db().from('supplies').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) {
    if (error.code === '23505') throw new Error('Ya tienes un insumo con ese nombre.');
    fail('guardar insumo', error);
  }
  await refreshRecipeStock();
}

/** Archived supplies leave the list and recipes; their history stays. */
export async function archiveSupply(id: string): Promise<void> {
  const supabase = db();
  const [{ error: e1 }, { error: e2 }, { error: e3 }] = await Promise.all([
    supabase.from('product_recipes').delete().eq('supply_id', id),
    supabase.from('option_recipes').delete().eq('supply_id', id),
    supabase.from('supplies').update({ is_archived: true }).eq('id', id),
  ]);
  const error = e1 ?? e2 ?? e3;
  if (error) fail('archivar insumo', error);
  await refreshRecipeStock();
}

/** compra (adds, updates cost) · merma (subtracts) · ajuste (sets the counted stock). Returns the new stock. */
export async function recordMovement(
  supplyId: string, kind: 'compra' | 'merma' | 'ajuste', quantity: number, unitCost: number | null, note: string | null,
): Promise<number> {
  const { data, error } = await db().rpc('record_supply_movement', {
    p_supply_id: supplyId, p_kind: kind, p_quantity: quantity, p_unit_cost: unitCost, p_note: note,
  });
  if (error) fail('registrar movimiento', error);
  return Number(data);
}

export async function fetchMovements(tenantId: string, limit = 80): Promise<SupplyMovement[]> {
  const { data, error } = await db()
    .from('supply_movements').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(limit);
  if (error) fail('movimientos', error);
  return (data ?? []).map((m: any) => ({ ...m, quantity: Number(m.quantity), unit_cost: m.unit_cost === null ? null : Number(m.unit_cost) }));
}

/** Today's sales movements (for the "runs out around…" forecast). */
export async function fetchSalesSince(tenantId: string, sinceIso: string): Promise<SupplyMovement[]> {
  const { data, error } = await db()
    .from('supply_movements').select('*').eq('tenant_id', tenantId).in('kind', ['venta', 'anulacion']).gte('created_at', sinceIso);
  if (error) fail('ventas de hoy', error);
  return (data ?? []).map((m: any) => ({ ...m, quantity: Number(m.quantity) }));
}

export async function fetchProductRecipes(tenantId: string): Promise<Record<string, RecipeLine[]>> {
  const { data, error } = await db().from('product_recipes').select('product_id, supply_id, quantity').eq('tenant_id', tenantId);
  if (error) fail('recetas', error);
  const out: Record<string, RecipeLine[]> = {};
  for (const r of data ?? []) (out[r.product_id] ||= []).push({ supply_id: r.supply_id, quantity: Number(r.quantity) });
  return out;
}

export async function fetchOptionRecipes(tenantId: string): Promise<Record<string, RecipeLine[]>> {
  const { data, error } = await db().from('option_recipes').select('option_id, supply_id, quantity').eq('tenant_id', tenantId);
  if (error) fail('recetas de opciones', error);
  const out: Record<string, RecipeLine[]> = {};
  for (const r of data ?? []) (out[r.option_id] ||= []).push({ supply_id: r.supply_id, quantity: Number(r.quantity) });
  return out;
}

/** Replaces the whole recipe of a product (empty = the product goes back to manual stock). */
export async function saveProductRecipe(tenantId: string, productId: string, lines: RecipeLine[]): Promise<void> {
  const supabase = db();
  const { error: delErr } = await supabase.from('product_recipes').delete().eq('product_id', productId);
  if (delErr) fail('guardar receta', delErr);
  if (lines.length > 0) {
    const { error } = await supabase.from('product_recipes')
      .insert(lines.map(l => ({ tenant_id: tenantId, product_id: productId, supply_id: l.supply_id, quantity: l.quantity })));
    if (error) fail('guardar receta', error);
  }
  await refreshRecipeStock();
}

export async function saveOptionRecipe(tenantId: string, optionId: string, lines: RecipeLine[]): Promise<void> {
  const supabase = db();
  const { error: delErr } = await supabase.from('option_recipes').delete().eq('option_id', optionId);
  if (delErr) fail('guardar opción', delErr);
  if (lines.length > 0) {
    const { error } = await supabase.from('option_recipes')
      .insert(lines.map(l => ({ tenant_id: tenantId, option_id: optionId, supply_id: l.supply_id, quantity: l.quantity })));
    if (error) fail('guardar opción', error);
  }
}

async function refreshRecipeStock() {
  const { error } = await db().rpc('refresh_my_recipe_stock');
  if (error) fail('recalcular stock', error);
}

/** Products (with their option groups) to attach recipes to. */
export async function fetchProductsWithOptions(tenantId: string) {
  const { data, error } = await db()
    .from('products')
    .select('id, name, category, stock, is_available, product_modifier_groups(id, name, product_modifier_options(id, name))')
    .eq('tenant_id', tenantId).eq('is_archived', false).order('category').order('name');
  if (error) fail('productos', error);
  return (data ?? []) as {
    id: string; name: string; category: string; stock: number; is_available: boolean;
    product_modifier_groups: { id: string; name: string; product_modifier_options: { id: string; name: string }[] }[];
  }[];
}

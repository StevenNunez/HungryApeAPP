import { createClient } from '@/lib/supabase/client';

/**
 * Product options ("modifiers"): groups like "Salsas" or "Punto de cocción" with
 * their options. Browser client, RLS: owner and manager. Every function throws on error.
 */

export interface ModifierOptionRow {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  sort_order: number;
}

export interface ModifierGroupRow {
  id: string;
  product_id: string;
  name: string;
  type: 'checkbox' | 'radio';
  required: boolean;
  sort_order: number;
  product_modifier_options: ModifierOptionRow[];
}

export interface GroupPreset {
  name: string;
  type: 'checkbox' | 'radio';
  required: boolean;
  options: string[];
}

export const GROUP_PRESETS: { label: string; preset: GroupPreset }[] = [
  { label: '🧴 Salsas', preset: { name: 'Salsas', type: 'checkbox', required: false, options: ['Mayonesa', 'Ketchup', 'Ají', 'Mostaza'] } },
  { label: '🔥 Punto de cocción', preset: { name: 'Punto de cocción', type: 'radio', required: true, options: ['Jugoso', 'A punto', 'Bien cocido'] } },
  { label: '🥑 Sin ingredientes', preset: { name: 'Sin ingredientes', type: 'checkbox', required: false, options: ['Sin palta', 'Sin tomate', 'Sin cebolla', 'Sin lechuga'] } },
  { label: '🧀 Extras', preset: { name: 'Extras', type: 'checkbox', required: false, options: ['Queso extra', 'Tocino', 'Huevo frito'] } },
];

const fail = (what: string, error: { message: string }): never => {
  throw Object.assign(new Error(`${what}: ${error.message}`), { cause: error });
};

const sortOptions = (g: any): ModifierGroupRow => ({
  ...g,
  product_modifier_options: [...(g.product_modifier_options || [])].sort((a, b) => a.sort_order - b.sort_order),
});

export async function fetchGroups(productId: string): Promise<ModifierGroupRow[]> {
  const { data, error } = await createClient()
    .from('product_modifier_groups').select('*, product_modifier_options(*)').eq('product_id', productId).order('sort_order');
  if (error) fail('opciones del producto', error);
  return (data || []).map(sortOptions);
}

export async function createGroup(
  tenantId: string, productId: string, g: Omit<GroupPreset, 'options'>, sortOrder: number, options: string[] = [],
): Promise<ModifierGroupRow> {
  const supabase = createClient();
  const { data: group, error } = await supabase
    .from('product_modifier_groups')
    .insert({ product_id: productId, tenant_id: tenantId, name: g.name, type: g.type, required: g.required, sort_order: sortOrder })
    .select('*')
    .single();
  if (error || !group) fail('crear grupo', error ?? { message: 'sin datos' });

  let created: ModifierOptionRow[] = [];
  if (options.length > 0) {
    const { data: opts, error: oErr } = await supabase
      .from('product_modifier_options')
      .insert(options.map((name, i) => ({ group_id: group!.id, tenant_id: tenantId, name, price_delta: 0, sort_order: i })))
      .select();
    if (oErr) fail('crear opciones', oErr);
    created = (opts as ModifierOptionRow[]) ?? [];
  }
  return sortOptions({ ...group, product_modifier_options: created });
}

export async function deleteGroup(groupId: string): Promise<void> {
  const { error } = await createClient().from('product_modifier_groups').delete().eq('id', groupId);
  if (error) fail('borrar grupo', error);
}

export async function createOption(tenantId: string, groupId: string, name: string, priceDelta: number, sortOrder: number): Promise<ModifierOptionRow> {
  const { data, error } = await createClient()
    .from('product_modifier_options')
    .insert({ group_id: groupId, tenant_id: tenantId, name, price_delta: priceDelta, sort_order: sortOrder })
    .select()
    .single();
  if (error || !data) fail('crear opción', error ?? { message: 'sin datos' });
  return data as ModifierOptionRow;
}

export async function deleteOption(optionId: string): Promise<void> {
  const { error } = await createClient().from('product_modifier_options').delete().eq('id', optionId);
  if (error) fail('borrar opción', error);
}

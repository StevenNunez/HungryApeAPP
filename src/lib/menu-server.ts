import { createServerSupabaseClient } from '@/lib/supabase/server';
import { mapProductRow, mapModifierGroupRow } from '@/lib/types';
import type { MenuItem, ModifierGroup } from '@/lib/types';

export interface TenantMenu {
  tenant: { id: string; name: string; description: string | null; logoUrl: string | null };
  items: MenuItem[];
  groups: Record<string, ModifierGroup[]>;
}

/**
 * Server-side fetch for the public menu page: tenant + products + modifier groups,
 * so the customer's phone receives the menu already rendered (no spinner / waterfall).
 * Returns null when the slug does not exist.
 */
export async function getTenantMenu(slug: string): Promise<TenantMenu | null> {
  const supabase = await createServerSupabaseClient();

  const { data: tenant } = await supabase
    .from('tenants_public')
    .select('id, name, description, logo_url')
    .eq('slug', slug)
    .maybeSingle();
  if (!tenant) return null;

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('is_archived', false)
    .eq('is_available', true)
    .order('category')
    .order('name');

  const items = (products || []).map(mapProductRow);

  const groups: Record<string, ModifierGroup[]> = {};
  if (items.length > 0) {
    const { data: groupRows } = await supabase
      .from('product_modifier_groups')
      .select('*, product_modifier_options(*)')
      .in('product_id', items.map(i => i.id))
      .order('sort_order');
    for (const row of groupRows || []) {
      const group = mapModifierGroupRow(row);
      (groups[group.productId] ||= []).push(group);
    }
  }

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      description: tenant.description ?? null,
      logoUrl: tenant.logo_url ?? null,
    },
    items,
    groups,
  };
}

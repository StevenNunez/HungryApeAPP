import { cache } from 'react';
import { canTakeOrders } from '@/lib/plans';

const DEMO_TENANT_ID = 'a0000000-0000-0000-0000-000000000001';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { mapProductRow, mapModifierGroupRow } from '@/lib/types';
import type { MenuItem, ModifierGroup } from '@/lib/types';

export interface TenantMenu {
  tenant: { id: string; name: string; description: string | null; logoUrl: string | null };
  /** False after the trial when no plan was activated: the menu shows, orders pause. */
  ordersOpen: boolean;
  items: MenuItem[];
  groups: Record<string, ModifierGroup[]>;
}

/**
 * Server-side fetch for the public menu page: tenant + products + modifier groups,
 * so the customer's phone receives the menu already rendered (no spinner / waterfall).
 * Returns null when the slug does not exist. Wrapped in React `cache()` so
 * generateMetadata and the page share a single fetch per request.
 */
export const getTenantMenu = cache(fetchTenantMenu);

async function fetchTenantMenu(slug: string): Promise<TenantMenu | null> {
  const supabase = await createServerSupabaseClient();

  const { data: tenant } = await supabase
    .from('tenants_public')
    .select('id, name, description, logo_url, effective_plan')
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
    ordersOpen: tenant.id === DEMO_TENANT_ID || canTakeOrders((tenant as any).effective_plan),
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

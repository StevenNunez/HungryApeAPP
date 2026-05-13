import { createClient } from '@/lib/supabase/client';
import type { MenuItem, Order, CartItem, ModifierGroup, PaymentMethod, OrderStatus, OrderType } from './types';
import { mapProductRow, mapOrderRow, mapModifierGroupRow } from './types';
import { generatePickupCode } from './utils';

// ── Demo tenant slug (used as fallback) ────────────────────────────────────
const DEMO_TENANT_SLUG = 'hungry-ape-demo';

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════

/** Fetch all products for a given tenant (by slug). */
export async function getMenuItems(tenantSlug: string = DEMO_TENANT_SLUG): Promise<MenuItem[]> {
  const supabase = createClient();

  // First get the tenant ID from the slug
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) return [];

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('is_archived', false)
    .eq('is_available', true)
    .order('category')
    .order('name');

  if (error) {
    console.error('Error fetching products:', error);
    return [];
  }

  return (data || []).map(mapProductRow);
}

/** Fetch modifier groups (with options) for a list of product IDs, keyed by product_id. */
export async function getProductModifierGroups(productIds: string[]): Promise<Record<string, ModifierGroup[]>> {
  if (productIds.length === 0) return {};
  const supabase = createClient();
  const { data } = await supabase
    .from('product_modifier_groups')
    .select('*, product_modifier_options(*)')
    .in('product_id', productIds)
    .order('sort_order');

  const result: Record<string, ModifierGroup[]> = {};
  for (const row of data || []) {
    const group = mapModifierGroupRow(row);
    if (!result[group.productId]) result[group.productId] = [];
    result[group.productId].push(group);
  }
  return result;
}

/** Archive a product instead of deleting it. */
export async function archiveProduct(productId: string, shouldArchive: boolean = true): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('products')
    .update({ is_archived: shouldArchive })
    .eq('id', productId);

  if (error) {
    console.error('Error archiving product:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════════

// ── Free plan constants ─────────────────────────────────────────────────────
export const FREE_PLAN_MAX_ORDERS = 40;
export const FREE_PLAN_MAX_PRODUCTS = 15;
export const FREE_PLAN_ALERT_THRESHOLD = Math.floor(FREE_PLAN_MAX_ORDERS * 0.8); // 32

/**
 * Returns the effective plan for a tenant, accounting for active trials.
 * A tenant in 'trial' status with a future trial_ends_at is treated as 'starter'.
 * Once trial_ends_at passes, it falls back to 'gratis'.
 */
export function getEffectivePlan(tenant: {
  plan_id?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
}): string {
  if (
    tenant.subscription_status === 'trial' &&
    tenant.trial_ends_at &&
    new Date(tenant.trial_ends_at) > new Date()
  ) {
    return 'starter';
  }
  return tenant.plan_id || 'gratis';
}

/** Get the number of orders made today for a given tenant. */
export async function getTodayOrderCount(tenantId: string): Promise<number> {
  const supabase = createClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', today.toISOString());
  return count ?? 0;
}

/** Create a new order with its line items. Returns { id, pickupCode }. */
export async function createOrder(
  tenantSlug: string = DEMO_TENANT_SLUG,
  nickname: string,
  items: CartItem[],
  total: number,
  paymentMethod: PaymentMethod,
  orderType: OrderType = 'aqui',
): Promise<{ id: string; pickupCode: string; shortId?: number }> {
  const supabase = createClient();
  const pickupCode = generatePickupCode();

  // Get tenant ID and plan
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, plan_id, subscription_status, trial_ends_at')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) throw new Error('Tenant not found');

  const planId = getEffectivePlan(tenant as any);

  // Enforcement: Limit daily orders for Free plan
  if (planId === 'gratis') {
    const count = await getTodayOrderCount(tenant.id);
    if (count >= FREE_PLAN_MAX_ORDERS) {
      throw new Error('LIMIT_REACHED: El local ha alcanzado su límite de pedidos gratis por hoy.');
    }
  }

  // Insert the order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      tenant_id: tenant.id,
      nickname,
      pickup_code: pickupCode,
      payment_method: paymentMethod,
      order_type: orderType,
      total,
      status: 'Por Pagar',
    } as any)
    .select('id, short_id')
    .single();

  if (orderError || !order) {
    console.error('Error creating order:', orderError);
    throw new Error('Failed to create order');
  }

  // Insert order items (effective price = base + modifier deltas)
  const orderItemsToInsert = items.map(item => ({
    order_id: order.id,
    product_id: item.id,
    product_name: item.name,
    price: item.price + (item.modifierPrice ?? 0),
    quantity: item.quantity,
  }));

  const { data: insertedItems, error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItemsToInsert)
    .select('id');

  if (itemsError) {
    console.error('Error inserting order items:', itemsError);
  }

  // Save modifier selections
  if (insertedItems && insertedItems.length > 0) {
    const modifierRows: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const mods = items[i].selectedModifiers;
      if (!mods || mods.length === 0) continue;
      const orderItemId = insertedItems[i]?.id;
      if (!orderItemId) continue;
      for (const mod of mods) {
        modifierRows.push({
          order_item_id: orderItemId,
          option_id: mod.optionId || null,
          option_name: mod.optionName,
          group_name: mod.groupName,
          price_delta: mod.priceDelta,
        });
      }
    }
    if (modifierRows.length > 0) {
      await supabase.from('order_item_modifiers').insert(modifierRows);
    }
  }

  return { id: order.id, pickupCode, shortId: order.short_id ?? undefined };
}

/** Fetch an order by its ID, including line items. */
export async function getOrderById(orderId: string): Promise<Order | null> {
  const supabase = createClient();

  const { data: orderRow, error } = await supabase
    .from('orders')
    .select(`
      *,
      tenants(
        transfer_bank,
        transfer_account_type,
        transfer_account_number,
        transfer_rut,
        transfer_email
      )
    `)
    .eq('id', orderId)
    .single();

  if (error || !orderRow) return null;

  // Fetch items
  const { data: itemRows } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  const itemIds = (itemRows || []).map((r: any) => r.id);
  const { data: modifierRows } = itemIds.length > 0
    ? await supabase.from('order_item_modifiers').select('*').in('order_item_id', itemIds)
    : { data: [] };

  const cartItems: CartItem[] = (itemRows || []).map((row: any) => {
    const mods = (modifierRows || [])
      .filter((m: any) => m.order_item_id === row.id)
      .map((m: any) => ({
        optionId: m.option_id ?? '',
        optionName: m.option_name,
        groupName: m.group_name,
        priceDelta: Number(m.price_delta),
      }));
    return {
      id: row.product_id,
      tenantId: (orderRow as any).tenant_id,
      name: row.product_name,
      description: '',
      price: Number(row.price),
      imageUrl: '',
      category: '',
      isAvailable: true,
      isArchived: false,
      stock: 0,
      aiHint: '',
      quantity: row.quantity,
      cartKey: row.id,
      selectedModifiers: mods,
      modifierPrice: 0,
    };
  });

  return mapOrderRow(orderRow, cartItems);
}

/** Fetch all orders for a given tenant (kitchen view). */
export async function getOrdersByTenant(tenantSlug: string = DEMO_TENANT_SLUG): Promise<Order[]> {
  const supabase = createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) return [];

  let query = supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: true });

  // Para la demo: solo mostrar pedidos de las últimas 2 horas
  // Los pedidos viejos se borran en /api/demo/cleanup, pero esto es defensa adicional
  if (tenantSlug === DEMO_TENANT_SLUG) {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    query = query.gte('created_at', since);
  }

  const { data: orderRows, error } = await query;

  if (error || !orderRows) return [];

  // Fetch all order items in one call
  const orderIds = orderRows.map(o => o.id);
  const { data: allItems } = await supabase
    .from('order_items')
    .select('*')
    .in('order_id', orderIds);

  // Fetch all modifiers for those items
  const allItemIds = (allItems || []).map((i: any) => i.id);
  const { data: allModifiers } = allItemIds.length > 0
    ? await supabase.from('order_item_modifiers').select('*').in('order_item_id', allItemIds)
    : { data: [] };

  return orderRows.map(row => {
    const rowItems = (allItems || []).filter((i: any) => i.order_id === row.id);
    const cartItems: CartItem[] = rowItems.map((item: any) => {
      const mods = (allModifiers || [])
        .filter((m: any) => m.order_item_id === item.id)
        .map((m: any) => ({
          optionId: m.option_id ?? '',
          optionName: m.option_name,
          groupName: m.group_name,
          priceDelta: Number(m.price_delta),
        }));
      return {
        id: item.product_id,
        tenantId: row.tenant_id,
        name: item.product_name,
        description: '',
        price: Number(item.price),
        imageUrl: '',
        category: '',
        isAvailable: true,
        isArchived: false,
        stock: 0,
        aiHint: '',
        quantity: item.quantity,
        cartKey: item.id,
        selectedModifiers: mods,
        modifierPrice: 0,
      };
    });
    return mapOrderRow(row, cartItems);
  });
}

/** Update order status (kitchen actions). */
export async function updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId)
    .select('id');

  if (error) {
    console.error('Error updating order status:', error);
    throw error;
  }

  // If RLS silently blocked the update, data will be empty (0 rows affected)
  if (!data || data.length === 0) {
    throw new Error('RLS_BLOCKED: update returned 0 rows — check demo RLS policy (migration 010)');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REALTIME SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════════════════

/** Subscribe to new/updated orders for a tenant (for kitchen view). */
export function subscribeToOrders(
  tenantId: string,
  onInsert: (order: any) => void,
  onUpdate: (order: any) => void,
) {
  const supabase = createClient();

  const channel = supabase
    .channel(`orders-${tenantId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
      (payload) => onInsert(payload.new),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
      (payload) => onUpdate(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Subscribe to changes on a single order via tenant-level filter (more reliable than id filter). */
export function subscribeToOrderStatus(
  tenantId: string,
  orderId: string,
  onUpdate: (order: any) => void,
) {
  const supabase = createClient();

  const channel = supabase
    .channel(`order-status-${orderId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
      (payload) => {
        if (payload.new?.id === orderId) onUpdate(payload.new);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
/** Subscribe to product changes for a tenant (for real-time stock/price updates in menu). */
export function subscribeToProducts(
  tenantId: string,
  onChange: () => void,
) {
  const supabase = createClient();

  const channel = supabase
    .channel(`products-${tenantId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tenantId}` },
      () => onChange(),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

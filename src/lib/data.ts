import { createClient } from '@/lib/supabase/client';
import type { MenuItem, Order, CartItem, ModifierGroup, PaymentMethod, OrderStatus, OrderType } from './types';
import { mapProductRow, mapOrderRow, mapModifierGroupRow } from './types';

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
    .from('tenants_public')
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

// getEffectivePlan lives in ./plans (pure, shared with server routes); re-exported for existing imports
export { getEffectivePlan } from './plans';

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

/**
 * Create a new order. The server (RPC `create_order`) validates stock, takes
 * prices from the DB, computes the total and enforces the plan limits, all in
 * one transaction. The client only sends WHAT was chosen, never how much it costs.
 */
export async function createOrder(
  tenantSlug: string = DEMO_TENANT_SLUG,
  nickname: string,
  items: CartItem[],
  paymentMethod: PaymentMethod,
  orderType: OrderType = 'aqui',
): Promise<{ id: string; pickupCode: string; shortId?: number }> {
  const supabase = createClient();

  const { data: rpcData, error } = await supabase.rpc('create_order', {
    p_tenant_slug: tenantSlug,
    p_nickname: nickname,
    p_payment_method: paymentMethod,
    p_order_type: orderType,
    p_items: items.map(item => ({
      product_id: item.id,
      quantity: item.quantity,
      option_ids: (item.selectedModifiers ?? []).map(m => m.optionId).filter(Boolean),
    })),
  });

  if (error || !rpcData) {
    console.error('Error creating order:', error);
    // The RPC raises 'LIMIT_REACHED: …', 'OUT_OF_STOCK: …', etc.; keep the message
    throw new Error(error?.message || 'Failed to create order');
  }

  const data = rpcData as unknown as { id: string; pickup_code: string; short_id: number | null };
  return { id: data.id, pickupCode: data.pickup_code, shortId: data.short_id ?? undefined };
}

/** Shape returned by the `get_order_public` RPC (see migration 013). */
interface PublicOrderPayload {
  id: string;
  tenant_id: string;
  nickname: string;
  pickup_code: string;
  short_id: number | null;
  status: string;
  payment_method: string;
  order_type: string;
  total: number;
  created_at: string;
  paid_online?: boolean;
  notify_enabled?: boolean;
  items: any[] | null;
  transfer: {
    bank: string | null;
    account_type: string | null;
    account_number: string | null;
    rut: string | null;
    email: string | null;
  } | null;
}

/** Fetch a single order (public tracking) through the `get_order_public` RPC. */
export async function getOrderById(orderId: string): Promise<Order | null> {
  const supabase = createClient();

  const { data: rpcData, error } = await supabase.rpc('get_order_public', { p_order_id: orderId });
  if (error || !rpcData) return null;
  const data = rpcData as unknown as PublicOrderPayload;

  const cartItems: CartItem[] = (data.items || []).map((row: any) => ({
    id: row.product_id,
    tenantId: data.tenant_id,
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
    selectedModifiers: (row.modifiers || []).map((m: any) => ({
      optionId: m.option_id ?? '',
      optionName: m.option_name,
      groupName: m.group_name,
      priceDelta: Number(m.price_delta),
    })),
    modifierPrice: 0,
  }));

  return mapOrderRow(
    {
      ...data,
      tenants: data.transfer
        ? {
            transfer_bank: data.transfer.bank,
            transfer_account_type: data.transfer.account_type,
            transfer_account_number: data.transfer.account_number,
            transfer_rut: data.transfer.rut,
            transfer_email: data.transfer.email,
          }
        : null,
    },
    cartItems,
  );
}

/** Fetch all orders for a given tenant (kitchen view). */
export async function getOrdersByTenant(tenantSlug: string = DEMO_TENANT_SLUG): Promise<Order[]> {
  const supabase = createClient();

  const { data: tenant } = await supabase
    .from('tenants_public')
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
  // Goes through the server so reaching "Listo" can fire the customer alerts (push / WhatsApp)
  const res = await fetch(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus }),
  });

  if (!res.ok) {
    const message = (await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`;
    console.error('Error updating order status:', message);
    throw new Error(message);
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

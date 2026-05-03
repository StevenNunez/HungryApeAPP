import { createClient } from '@/lib/supabase/client';
import type { MenuItem, Order, CartItem, PaymentMethod, OrderStatus } from './types';
import { mapProductRow, mapOrderRow } from './types';
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
): Promise<{ id: string; pickupCode: string; shortId?: number }> {
  const supabase = createClient();
  const pickupCode = generatePickupCode();

  // Get tenant ID and plan
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, plan_id')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) throw new Error('Tenant not found');

  const planId = tenant.plan_id || 'gratis';

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
      total,
      status: 'Por Pagar',
    })
    .select('id, short_id')
    .single();

  if (orderError || !order) {
    console.error('Error creating order:', orderError);
    throw new Error('Failed to create order');
  }

  // Insert order items (this triggers the auto stock decrement)
  const orderItems = items.map(item => ({
    order_id: order.id,
    product_id: item.id,
    product_name: item.name,
    price: item.price,
    quantity: item.quantity,
  }));

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems);

  if (itemsError) {
    console.error('Error inserting order items:', itemsError);
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

  const cartItems: CartItem[] = (itemRows || []).map((row: any) => ({
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
  }));

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

  const { data: orderRows, error } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: true });

  if (error || !orderRows) return [];

  // Fetch all order items in one call
  const orderIds = orderRows.map(o => o.id);
  const { data: allItems } = await supabase
    .from('order_items')
    .select('*')
    .in('order_id', orderIds);

  return orderRows.map(row => {
    const rowItems = (allItems || []).filter(i => i.order_id === row.id);
    const cartItems: CartItem[] = rowItems.map((item: any) => ({
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
    }));
    return mapOrderRow(row, cartItems);
  });
}

/** Update order status (kitchen actions). */
export async function updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId);

  if (error) {
    console.error('Error updating order status:', error);
    throw error;
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

/** Subscribe to changes on a single order (for customer order status page). */
export function subscribeToOrder(
  orderId: string,
  onUpdate: (order: any) => void,
) {
  const supabase = createClient();

  const channel = supabase
    .channel(`order-${orderId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
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

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

/** Start of today in Chile (America/Santiago), as an ISO instant — same day the server counts. */
export function startOfTodayInChile(now: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map(p => [p.type, p.value]),
  );
  const wallAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offsetMs).toISOString();
}

/** Orders made today (Chile) for a tenant — cancelled ones don't count towards the free limit. */
export async function getTodayOrderCount(tenantId: string): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .neq('status', 'Cancelado')
    .gte('created_at', startOfTodayInChile());
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
/** Public order tracking. Resolves null when the order doesn't exist; throws on network/DB errors. */
export async function getOrderById(orderId: string): Promise<Order | null> {
  const supabase = createClient();

  const { data: rpcData, error } = await supabase.rpc('get_order_public', { p_order_id: orderId });
  // A failed request is not the same as "this order does not exist": let the screen offer a retry
  if (error) throw new Error('No se pudo cargar el pedido');
  if (!rpcData) return null;
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

/** Order row with its items and modifiers embedded (one query instead of three). */
const KITCHEN_ORDER_SELECT = '*, order_items(*, order_item_modifiers(*))';

function mapKitchenOrder(row: any): Order {
  const cartItems: CartItem[] = (row.order_items || []).map((item: any) => ({
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
    selectedModifiers: (item.order_item_modifiers || []).map((m: any) => ({
      optionId: m.option_id ?? '',
      optionName: m.option_name,
      groupName: m.group_name,
      priceDelta: Number(m.price_delta),
    })),
    modifierPrice: 0,
  }));
  return mapOrderRow(row, cartItems);
}

/** Hours a delivered order stays visible in the kitchen ("Últimos entregados"). */
const KITCHEN_DELIVERED_WINDOW_H = 3;

/**
 * Orders the kitchen needs right now: everything still in progress plus the ones
 * delivered in the last few hours — never the whole history of the business.
 * Abandoned "Por Pagar" orders (>60 min) are cancelled first, returning their stock.
 * Throws on network/DB errors so the screen can tell "failed" from "no orders".
 */
export async function getKitchenOrders(tenantId: string): Promise<Order[]> {
  const supabase = createClient();

  // Best effort: if it fails the kitchen still loads (create_order also expires them)
  await supabase.rpc('expire_unpaid_orders_for', { p_tenant_id: tenantId }).then(
    () => undefined,
    () => undefined,
  );

  const since = new Date(Date.now() - KITCHEN_DELIVERED_WINDOW_H * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('orders')
    .select(KITCHEN_ORDER_SELECT)
    .eq('tenant_id', tenantId)
    .or(`status.in.("Por Pagar",Pendiente,"En preparación",Listo),and(status.eq.Entregado,delivered_at.gte."${since}")`)
    .order('created_at', { ascending: true })
    .limit(300);

  if (error) {
    console.error('Error fetching kitchen orders:', error.message);
    throw new Error('No se pudieron cargar los pedidos');
  }
  return (data || []).map(mapKitchenOrder);
}

/** One order with its items, for when a new order arrives in the kitchen. */
export async function getKitchenOrder(orderId: string): Promise<Order | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('orders')
    .select(KITCHEN_ORDER_SELECT)
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw new Error('No se pudo cargar el pedido');
  return data ? mapKitchenOrder(data) : null;
}

/** Update order status (kitchen actions). */
export async function updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
  // Goes through the server so reaching "Listo" can fire the customer alerts (push / WhatsApp)
  const res = await fetch(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    keepalive: true,
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

export type RealtimeHealth = 'connecting' | 'live' | 'offline';

/**
 * Subscribe to new/updated orders for a tenant (kitchen view).
 * `onHealth` reports the channel state: a tablet that sleeps or a shaky wifi drops
 * the socket, and the kitchen must know (and catch up) instead of silently missing orders.
 * On error the channel is torn down and re-created with backoff.
 */
export function subscribeToOrders(
  tenantId: string,
  onInsert: (order: any) => void,
  onUpdate: (order: any) => void,
  onHealth?: (health: RealtimeHealth) => void,
) {
  const supabase = createClient();
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let closed = false;

  const connect = () => {
    if (closed) return;
    onHealth?.('connecting');
    channel = supabase
      .channel(`orders-${tenantId}-${Date.now()}`)
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
      .subscribe((status) => {
        if (closed) return;
        if (status === 'SUBSCRIBED') {
          attempt = 0;
          onHealth?.('live');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          onHealth?.('offline');
          if (retry) return;
          const ch = channel;
          channel = null;
          if (ch) void supabase.removeChannel(ch);
          const delay = Math.min(30_000, 1000 * 2 ** attempt++);
          retry = setTimeout(() => { retry = null; connect(); }, delay);
        }
      });
  };

  connect();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    if (channel) void supabase.removeChannel(channel);
  };
}

/** Product change event as delivered by Realtime (row after the change, or the deleted id). */
export interface ProductChange {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  row: any;
}

/** Subscribe to product changes for a tenant (for real-time stock/price updates in menu). */
export function subscribeToProducts(
  tenantId: string,
  onChange: (change: ProductChange) => void,
) {
  const supabase = createClient();

  const channel = supabase
    .channel(`products-${tenantId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tenantId}` },
      (payload: any) => onChange({
        eventType: payload.eventType,
        row: payload.eventType === 'DELETE' ? payload.old : payload.new,
      }),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}


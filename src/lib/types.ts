// ── Frontend-facing types (mapped from Supabase rows) ────────────────────

export interface MenuItem {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
  isAvailable: boolean;
  /** How many units are left in inventory */
  stock: number;
  aiHint: string;
  isArchived: boolean;
}

export interface ModifierOption {
  id: string;
  groupId: string;
  name: string;
  priceDelta: number;
  sortOrder: number;
}

export interface ModifierGroup {
  id: string;
  productId: string;
  name: string;
  type: 'checkbox' | 'radio';
  required: boolean;
  sortOrder: number;
  options: ModifierOption[];
}

export interface SelectedModifier {
  optionId: string;
  optionName: string;
  groupName: string;
  priceDelta: number;
}

export interface CartItem extends MenuItem {
  quantity: number;
  /** Unique key: productId + '__' + sorted optionIds — lets the same product appear multiple times with different modifiers */
  cartKey: string;
  selectedModifiers: SelectedModifier[];
  /** Sum of all selected modifier price_deltas */
  modifierPrice: number;
}

export type OrderStatus = 'Por Pagar' | 'Pendiente' | 'En preparación' | 'Listo' | 'Entregado';
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'qr';
export type OrderType = 'aqui' | 'llevar';

export interface Order {
  id: string;
  tenantId: string;
  nickname: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  orderType: OrderType;
  /** 4-character alphanumeric code used to verify pickup identity */
  pickupCode: string;
  /** Sequential daily ticket number (e.g. 1, 2, 3) */
  shortId?: number;
  createdAt: Date;
  /** Populated for display if order payment is transfer */
  transferDetails?: {
    bank: string;
    accountType: string;
    accountNumber: string;
    rut: string;
    email: string;
  };
}

// ── Mappers: DB row → Frontend type ──────────────────────────────────────

/** Maps a Supabase products row to our MenuItem type */
export function mapProductRow(row: any): MenuItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    imageUrl: row.image_url,
    category: row.category,
    isAvailable: row.is_available,
    stock: row.stock,
    aiHint: row.ai_hint,
    isArchived: row.is_archived || false,
  };
}

/** Maps a product_modifier_groups row (with nested options) to ModifierGroup */
export function mapModifierGroupRow(row: any): ModifierGroup {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    type: row.type,
    required: row.required,
    sortOrder: row.sort_order,
    options: (row.product_modifier_options || [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((o: any): ModifierOption => ({
        id: o.id,
        groupId: o.group_id,
        name: o.name,
        priceDelta: Number(o.price_delta),
        sortOrder: o.sort_order,
      })),
  };
}

/** Maps a Supabase orders row (with nested order_items) to our Order type */
export function mapOrderRow(row: any, items: CartItem[]): Order {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    nickname: row.nickname,
    items,
    total: Number(row.total),
    status: row.status as OrderStatus,
    paymentMethod: row.payment_method as PaymentMethod,
    pickupCode: row.pickup_code,
    shortId: row.short_id,
    orderType: (row.order_type as OrderType) ?? 'aqui',
    createdAt: new Date(row.created_at),
    transferDetails: row.tenants ? {
      bank: row.tenants.transfer_bank || '',
      accountType: row.tenants.transfer_account_type || '',
      accountNumber: row.tenants.transfer_account_number || '',
      rut: row.tenants.transfer_rut || '',
      email: row.tenants.transfer_email || '',
    } : undefined,
  };
}

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

export interface CartItem extends MenuItem {
  quantity: number;
}

export type OrderStatus = 'Por Pagar' | 'Pendiente' | 'En preparación' | 'Listo' | 'Entregado';
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'qr';

export interface Order {
  id: string;
  tenantId: string;
  nickname: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
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

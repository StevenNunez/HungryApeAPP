/**
 * Cash register (caja): types and pure calculations. No React, no Supabase —
 * so the arithmetic of a cash count can be tested on its own.
 */

export type CashSession = {
  id: string;
  tenant_id: string;
  opened_at: string;
  opening_amount: number;
  closed_at: string | null;
  closing_amount: number | null;
  notes: string;
  status: 'open' | 'closed';
};

export type CajaOrder = {
  id: string;
  nickname: string;
  short_id: number | null;
  payment_method: string;
  total: number;
  status: string;
  created_at: string;
};

export type Withdrawal = {
  id: string;
  session_id: string;
  amount: number;
  reason: string;
  created_at: string;
};

export const PAYMENT_METHODS = ['cash', 'transfer', 'card', 'qr', 'online'] as const;

export const PAY_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  qr: 'QR/App',
  online: 'Pago online',
};

export const PAY_COLORS: Record<string, string> = {
  cash: 'bg-green-500/10 text-green-800 border-green-500/20',
  transfer: 'bg-blue-500/10 text-blue-800 border-blue-500/20',
  card: 'bg-purple-500/10 text-purple-800 border-purple-500/20',
  qr: 'bg-orange-500/10 text-orange-800 border-orange-500/20',
  online: 'bg-primary/10 text-primary border-primary/20',
};

export function elapsed(from: string, now = Date.now()): string {
  const ms = now - new Date(from).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Santiago' });
}

/** Sales of a session by payment method (every method always present, even at 0). */
export function computeTotals(orders: CajaOrder[]) {
  const byMethod: Record<string, number> = Object.fromEntries(PAYMENT_METHODS.map(m => [m, 0]));
  let total = 0;
  for (const o of orders) {
    const amount = Number(o.total) || 0;
    byMethod[o.payment_method] = (byMethod[o.payment_method] || 0) + amount;
    total += amount;
  }
  return { byMethod, total };
}

/**
 * Cash count. Only CASH sales end up in the drawer:
 *   expected = opening + cash sales − withdrawals;  diff = counted − expected
 * (diff > 0 → surplus, diff < 0 → shortage).
 */
export function computeArqueo(sess: CashSession, orders: CajaOrder[], withdrawals: Withdrawal[], counted?: number | null) {
  const { byMethod, total } = computeTotals(orders);
  const totalWithdrawals = withdrawals.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  const expectedCash = (Number(sess.opening_amount) || 0) + byMethod.cash - totalWithdrawals;
  const actualCash = counted ?? (sess.closing_amount === null ? 0 : Number(sess.closing_amount));
  const diff = actualCash - expectedCash;
  return { byMethod, total, totalWithdrawals, expectedCash, actualCash, diff };
}

/** Parses an amount typed by a person ("15.000", "15000", "15 000") into CLP; null if not a number. */
export function parseAmount(raw: string): number | null {
  const clean = raw.replace(/[\s.$]/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n) : null;
}

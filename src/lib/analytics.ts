/**
 * Pure report calculations (no I/O) for the Pro reports: profitability, preparation
 * times, restock alerts and sales by day. Kept free of React / Supabase so they are
 * easy to unit-test and to reuse in the Excel / PDF exports.
 */

// ─── Date ranges ─────────────────────────────────────────────────────────────

export type ReportRange = 'hoy' | '7d' | '30d' | 'todo';

export const RANGE_LABELS: Record<ReportRange, string> = {
  hoy: 'Hoy',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  todo: 'Todo el historial',
};

/** ISO timestamp where the range starts (local midnight), or null for "all time". */
export function rangeStart(range: ReportRange, now: Date = new Date()): string | null {
  if (range === 'todo') return null;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (range === '7d') d.setDate(d.getDate() - 6);
  if (range === '30d') d.setDate(d.getDate() - 29);
  return d.toISOString();
}

// ─── Profitability ───────────────────────────────────────────────────────────

export interface SaleLine {
  productId: string | null;
  name: string;
  quantity: number;
  /** Effective unit price charged (base + paid extras). */
  price: number;
  /** Unit cost frozen when the order was placed (null = unknown at that time). */
  unitCost: number | null;
}

export interface ProfitRow {
  key: string;
  name: string;
  units: number;
  revenue: number;
  /** Cost of the units whose cost is known. */
  cost: number;
  /** Margin over the revenue whose cost is known. */
  margin: number;
  marginPct: number | null;
  /** True when every unit sold has a known cost. */
  complete: boolean;
}

export interface Profitability {
  rows: ProfitRow[];
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  /** Share of the revenue (0-100) that has a known cost. */
  coveragePct: number;
}

/**
 * @param currentCosts fallback cost per product id, used for lines sold before the cost was loaded
 */
export function computeProfitability(
  lines: SaleLine[],
  currentCosts: Record<string, number | null> = {},
): Profitability {
  const acc = new Map<string, {
    name: string; units: number; revenue: number; knownRevenue: number; cost: number; unknownUnits: number;
  }>();

  for (const l of lines) {
    const key = l.productId ?? `name:${l.name}`;
    const unitCost = l.unitCost ?? (l.productId ? currentCosts[l.productId] ?? null : null);
    const row = acc.get(key) ?? { name: l.name, units: 0, revenue: 0, knownRevenue: 0, cost: 0, unknownUnits: 0 };
    const lineRevenue = l.price * l.quantity;
    row.units += l.quantity;
    row.revenue += lineRevenue;
    if (unitCost === null) {
      row.unknownUnits += l.quantity;
    } else {
      row.knownRevenue += lineRevenue;
      row.cost += unitCost * l.quantity;
    }
    acc.set(key, row);
  }

  const rows: ProfitRow[] = [...acc.entries()].map(([key, r]) => {
    const margin = r.knownRevenue - r.cost;
    return {
      key,
      name: r.name,
      units: r.units,
      revenue: r.revenue,
      cost: r.cost,
      margin,
      marginPct: r.knownRevenue > 0 ? (margin / r.knownRevenue) * 100 : null,
      complete: r.unknownUnits === 0,
    };
  }).sort((a, b) => b.margin - a.margin || b.revenue - a.revenue);

  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const knownRevenue = [...acc.values()].reduce((s, r) => s + r.knownRevenue, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const margin = knownRevenue - cost;

  return {
    rows,
    revenue,
    cost,
    margin,
    marginPct: knownRevenue > 0 ? (margin / knownRevenue) * 100 : null,
    coveragePct: revenue > 0 ? (knownRevenue / revenue) * 100 : 0,
  };
}

// ─── Preparation times ───────────────────────────────────────────────────────

export interface TimedOrder {
  id: string;
  confirmed_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
}

export interface OrderProductRef {
  orderId: string;
  productId: string | null;
  name: string;
}

export interface PrepTimes {
  /** Average minutes from "En preparación" to "Listo". */
  avgPrepMin: number | null;
  /** Average minutes from payment confirmed to "Listo" (customer waiting time). */
  avgWaitMin: number | null;
  measuredOrders: number;
  perProduct: { name: string; orders: number; avgPrepMin: number }[];
}

const minutesBetween = (from: string | null, to: string | null): number | null => {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return ms >= 0 ? ms / 60000 : null;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Per-product time is the average preparation time of the ORDERS that include the
 * product (a ticket is prepared as a whole), so it is exact for single-item orders
 * and an approximation for mixed ones.
 */
export function computePrepTimes(orders: TimedOrder[], refs: OrderProductRef[]): PrepTimes {
  const prepByOrder = new Map<string, number>();
  const prepValues: number[] = [];
  const waitValues: number[] = [];

  for (const o of orders) {
    const prep = minutesBetween(o.preparing_at, o.ready_at);
    const wait = minutesBetween(o.confirmed_at, o.ready_at);
    if (prep !== null) { prepByOrder.set(o.id, prep); prepValues.push(prep); }
    if (wait !== null) waitValues.push(wait);
  }

  const perProductMap = new Map<string, { name: string; values: number[]; seen: Set<string> }>();
  for (const r of refs) {
    const prep = prepByOrder.get(r.orderId);
    if (prep === undefined) continue;
    const key = r.productId ?? `name:${r.name}`;
    const entry = perProductMap.get(key) ?? { name: r.name, values: [], seen: new Set<string>() };
    if (!entry.seen.has(r.orderId)) {
      entry.seen.add(r.orderId);
      entry.values.push(prep);
    }
    perProductMap.set(key, entry);
  }

  return {
    avgPrepMin: avg(prepValues),
    avgWaitMin: avg(waitValues),
    measuredOrders: prepValues.length,
    perProduct: [...perProductMap.values()]
      .map(e => ({ name: e.name, orders: e.values.length, avgPrepMin: avg(e.values)! }))
      .sort((a, b) => b.avgPrepMin - a.avgPrepMin),
  };
}

export const formatMinutes = (m: number | null): string => {
  if (m === null) return '—';
  if (m < 1) return '< 1 min';
  return `${Math.round(m)} min`;
};

// ─── Restock alerts ──────────────────────────────────────────────────────────

export interface StockProduct {
  id: string;
  name: string;
  stock: number | null;
  cost: number | null;
  restock_target: number | null;
}

export interface RestockAlert {
  id: string;
  name: string;
  stock: number;
  /** Units to buy to reach the target (null when no target is set). */
  toBuy: number | null;
  /** Estimated purchase cost (null when target or cost is missing). */
  estimatedCost: number | null;
}

export function computeRestockAlerts(products: StockProduct[], threshold = 5): {
  alerts: RestockAlert[];
  totalEstimatedCost: number;
  withoutCost: number;
} {
  const alerts: RestockAlert[] = products
    .filter(p => p.stock !== null && p.stock <= threshold)
    .map(p => {
      const toBuy = p.restock_target !== null ? Math.max(0, p.restock_target - (p.stock as number)) : null;
      const estimatedCost = toBuy !== null && p.cost !== null ? toBuy * p.cost : null;
      return { id: p.id, name: p.name, stock: p.stock as number, toBuy, estimatedCost };
    })
    .sort((a, b) => a.stock - b.stock);

  return {
    alerts,
    totalEstimatedCost: alerts.reduce((s, a) => s + (a.estimatedCost ?? 0), 0),
    withoutCost: alerts.filter(a => a.estimatedCost === null).length,
  };
}

// ─── Sales by day ────────────────────────────────────────────────────────────

/** Groups by calendar date (dd/MM), in chronological order. Mondays of different weeks stay separate. */
export function salesByDay(orders: { created_at: string; total: number | string }[]) {
  const map = new Map<string, { label: string; total: number }>();
  for (const o of orders) {
    const d = new Date(o.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const entry = map.get(key) ?? { label, total: 0 };
    entry.total += Number(o.total);
    map.set(key, entry);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => ({ name: v.label, total: v.total }));
}

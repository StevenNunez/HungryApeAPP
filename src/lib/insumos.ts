/**
 * Supplies (insumos) by recipe — types and pure helpers (no React, no Supabase).
 * Stock lives in base units: 'unidad', grams ('g') or millilitres ('ml').
 */

export type SupplyUnit = 'unidad' | 'g' | 'ml';

export interface Supply {
  id: string;
  tenant_id: string;
  name: string;
  unit: SupplyUnit;
  stock: number;
  min_stock: number;
  target_stock: number | null;
  cost_per_unit: number | null;
  is_archived: boolean;
  updated_at: string;
}

export interface RecipeLine { supply_id: string; quantity: number }

export interface SupplyMovement {
  id: string;
  supply_id: string;
  kind: 'venta' | 'anulacion' | 'compra' | 'merma' | 'ajuste';
  quantity: number;
  unit_cost: number | null;
  order_id: string | null;
  note: string | null;
  created_at: string;
}

export const UNIT_LABEL: Record<SupplyUnit, string> = { unidad: 'unidades', g: 'gramos', ml: 'mililitros' };

export const MOVEMENT_LABEL: Record<SupplyMovement['kind'], string> = {
  venta: 'Venta',
  anulacion: 'Pedido anulado',
  compra: 'Compra',
  merma: 'Merma',
  ajuste: 'Conteo',
};

const nf = (max: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: max });

/** "1.250 g (1,25 kg)", "3 unidades", "500 ml" — grams/ml over 1000 also shown in kg/l. */
export function formatQty(value: number, unit: SupplyUnit): string {
  const v = Number(value) || 0;
  if (unit === 'unidad') return `${nf(1).format(v)} ${Math.abs(v) === 1 ? 'unidad' : 'unidades'}`;
  const big = unit === 'g' ? 'kg' : 'l';
  const base = `${nf(0).format(v)} ${unit}`;
  return Math.abs(v) >= 1000 ? `${base} (${nf(2).format(v / 1000)} ${big})` : base;
}

/** Short form for tables: "1,25 kg", "60 g", "3 un." */
export function formatQtyShort(value: number, unit: SupplyUnit): string {
  const v = Number(value) || 0;
  if (unit === 'unidad') return `${nf(1).format(v)} un.`;
  if (Math.abs(v) >= 1000) return `${nf(2).format(v / 1000)} ${unit === 'g' ? 'kg' : 'l'}`;
  return `${nf(0).format(v)} ${unit}`;
}

export type SupplyLevel = 'agotado' | 'bajo' | 'ok';

export function supplyLevel(s: Pick<Supply, 'stock' | 'min_stock'>): SupplyLevel {
  if (s.stock <= 0) return 'agotado';
  if (s.stock <= s.min_stock) return 'bajo';
  return 'ok';
}

/** How much to buy to reach the target stock (null when there's no target). */
export function toBuy(s: Pick<Supply, 'stock' | 'target_stock'>): number | null {
  if (s.target_stock === null || s.target_stock === undefined) return null;
  return Math.max(0, Number(s.target_stock) - Math.max(0, Number(s.stock)));
}

/**
 * When the supply runs out at today's pace: consumption since the first sale of the
 * day, extrapolated. Null without enough data (less than 30 min or no sales).
 */
export function runOutForecast(
  stock: number,
  soldToday: { quantity: number; created_at: string }[],
  now: Date = new Date(),
): Date | null {
  const sales = soldToday.filter(m => m.quantity < 0);
  if (stock <= 0 || sales.length === 0) return null;
  const first = Math.min(...sales.map(m => new Date(m.created_at).getTime()));
  const hours = (now.getTime() - first) / 3_600_000;
  if (hours < 0.5) return null;
  const used = sales.reduce((sum, m) => sum + -m.quantity, 0);
  const perHour = used / hours;
  if (perHour <= 0) return null;
  return new Date(now.getTime() + (stock / perHour) * 3_600_000);
}

/** Recipe cost of a product (null if a supply has no cost). */
export function recipeCost(lines: RecipeLine[], supplies: Map<string, Pick<Supply, 'cost_per_unit'>>): number | null {
  if (lines.length === 0) return null;
  let total = 0;
  for (const l of lines) {
    const cost = supplies.get(l.supply_id)?.cost_per_unit;
    if (cost === null || cost === undefined) return null;
    total += Number(cost) * Number(l.quantity);
  }
  return Math.round(total);
}

/** Units of a product the current supplies allow (null if it has no recipe). */
export function unitsPossible(lines: RecipeLine[], supplies: Map<string, Pick<Supply, 'stock'>>): number | null {
  if (lines.length === 0) return null;
  let min = Infinity;
  for (const l of lines) {
    const stock = Math.max(0, Number(supplies.get(l.supply_id)?.stock ?? 0));
    min = Math.min(min, Math.floor(stock / Number(l.quantity)));
  }
  return Number.isFinite(min) ? min : 0;
}

/** Parses "1,5" / "1.5" / "250" → number (decimal comma allowed); null if invalid. */
export function parseQty(raw: string): number | null {
  const clean = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** How a purchase was bought: base units, kilos/litres, or packs of N. */
export type BuyFormat = 'base' | 'grande' | 'pack';

/** Converts what the person typed into base units and cost per base unit. Pure (tested). */
export function purchaseToBase(
  _unit: SupplyUnit,
  format: BuyFormat,
  amount: number,
  packSize: number | null,
  price: number | null,
  priceIsTotal: boolean,
): { quantity: number; unitCost: number | null } {
  const perBuy = format === 'grande' ? 1000 : format === 'pack' ? (packSize ?? 0) : 1;
  const quantity = amount * perBuy;
  if (price === null || quantity <= 0) return { quantity, unitCost: null };
  const total = priceIsTotal ? price : price * amount;
  return { quantity, unitCost: Math.round((total / quantity) * 10000) / 10000 };
}


/** Price per the unit people think in: per kilo for grams, per litre for ml. */
export function humanUnitCost(costPerBase: number, unit: SupplyUnit): { value: number; per: string } {
  if (unit === 'g') return { value: costPerBase * 1000, per: 'kilo' };
  if (unit === 'ml') return { value: costPerBase * 1000, per: 'litro' };
  return { value: costPerBase, per: 'unidad' };
}

/** Last purchase price and its change vs the previous one (purchases newest first). */
export function priceTrend(purchases: { unit_cost: number | null; created_at: string }[]): { last: number; changePct: number | null; at: string } | null {
  const priced = purchases.filter(p => p.unit_cost !== null && p.unit_cost !== undefined) as { unit_cost: number; created_at: string }[];
  if (priced.length === 0) return null;
  const [last, prev] = priced;
  const changePct = prev && prev.unit_cost > 0 ? Math.round(((last.unit_cost - prev.unit_cost) / prev.unit_cost) * 1000) / 10 : null;
  return { last: last.unit_cost, changePct, at: last.created_at };
}

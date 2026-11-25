/**
 * Hungry Ape subscription plans — single source of truth for prices.
 * Pure data (no secrets, no SDK) so it can be imported from both the server
 * (Mercado Pago routes) and the browser (landing pricing section).
 *
 * Prices in CLP (integer — Mercado Pago does not accept decimals for CLP).
 *
 * Monthly flow  → PreApproval (recurring subscription, frequency: 1 month)
 * Annual flow   → Checkout Pro (one-time payment, total = priceAnnualPerMonth * 12)
 */
export const SUBSCRIPTION_PLANS = {
  basico: {
    id: 'basico',
    name: 'Básico',
    currency: 'CLP',
    priceMonthly: 4990,
    priceAnnualPerMonth: 3992,
    get priceAnnualTotal() { return this.priceAnnualPerMonth * 12; }, // 47904
    description: 'Hungry Ape Básico — Menú digital + QR + Cocina en tiempo real (hasta 40 pedidos/día)',
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    currency: 'CLP',
    priceMonthly: 14990,
    priceAnnualPerMonth: 11990,
    get priceAnnualTotal() { return this.priceAnnualPerMonth * 12; }, // 143880
    description: 'Hungry Ape Starter — Pedidos ilimitados + Caja + Inventario y analíticas',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    currency: 'CLP',
    priceMonthly: 29990,
    priceAnnualPerMonth: 23990,
    get priceAnnualTotal() { return this.priceAnnualPerMonth * 12; }, // 287880
    description: 'Hungry Ape Pro — Todo lo de Starter + Pagos online + Avisos al cliente + Rentabilidad',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    currency: 'CLP',
    priceMonthly: 79990,
    priceAnnualPerMonth: 63990,
    get priceAnnualTotal() { return this.priceAnnualPerMonth * 12; }, // 767880
    description: 'Hungry Ape Enterprise — Todo lo de Pro + Equipo con roles',
  },
} as const;

export type PlanId = keyof typeof SUBSCRIPTION_PLANS;

/** How each plan is called everywhere in the UI and emails (one place, so they can't drift). */
export const PLAN_LABEL: Record<PlanId | 'gratis', string> = {
  gratis: 'Sin plan activo',
  basico: 'Plan Básico',
  starter: 'Plan Starter',
  pro: 'Plan Pro',
  enterprise: 'Plan Enterprise',
};

/** Short name ("Básico") — for sentences like "Todo lo de Básico". */
export const PLAN_SHORT_NAME: Record<PlanId | 'gratis', string> = {
  gratis: 'Sin plan activo',
  basico: SUBSCRIPTION_PLANS.basico.name,
  starter: SUBSCRIPTION_PLANS.starter.name,
  pro: SUBSCRIPTION_PLANS.pro.name,
  enterprise: SUBSCRIPTION_PLANS.enterprise.name,
};

/** 4990 → "$4.990" (Chilean thousands separator, no Intl dependency). */
export function formatPlanPrice(amount: number): string {
  return '$' + String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ─── Plan tiers ──────────────────────────────────────────────────────────────
const PLAN_ORDER = ['gratis', 'basico', 'starter', 'pro', 'enterprise'] as const;

/** True when `plan` is the same tier as `min` or a higher one (e.g. planAtLeast('enterprise', 'pro')). */
export function planAtLeast(plan: string | null | undefined, min: (typeof PLAN_ORDER)[number]): boolean {
  const have = PLAN_ORDER.indexOf((plan ?? 'gratis') as (typeof PLAN_ORDER)[number]);
  return have >= PLAN_ORDER.indexOf(min);
}

/** Pro features: cost & margin, exports, prep times, "order ready" alerts, online payments. */
export const isProPlan = (plan: string | null | undefined) => planAtLeast(plan, 'pro');

// ─── What each plan includes — exactly what the landing (PricingSection) promises ───
// The database enforces the same numbers (create_order, products trigger, RLS of the
// cash register and team, migration 020). Change both together.

/**
 * Whether customers can order through the app. After the 14-day trial (Starter level)
 * a business must activate Básico: without a plan the menu stays visible but orders pause.
 */
export const canTakeOrders = (plan: string | null | undefined) => planAtLeast(plan, 'basico');

/** Orders per day (Chile calendar day). Básico: "Hasta 40 pedidos/día"; Starter: "sin límite". Without a plan: 0. */
export function dailyOrderLimit(plan: string | null | undefined): number | null {
  if (!canTakeOrders(plan)) return 0;
  return planAtLeast(plan, 'starter') ? null : 40;
}

/** Active products in the menu. Starter: "Hasta 100 productos"; Básico / no plan: 15. */
export function productLimit(plan: string | null | undefined): number | null {
  if (planAtLeast(plan, 'pro')) return null;
  if (planAtLeast(plan, 'starter')) return 100;
  return 15;
}

/** Cash register (open, withdrawals, close with count) — Starter: "Caja: inicio, cierre y arqueo". */
export const canUseCashRegister = (plan: string | null | undefined) => planAtLeast(plan, 'starter');

/** Live inventory and sales analytics — Starter: "Inventario en vivo", "Analíticas de ventas". */
export const canUseReports = (plan: string | null | undefined) => planAtLeast(plan, 'starter');

/** Supplies by recipe: every paid sale deducts bread, sausage, avocado… — Pro. */
export const canUseSupplies = (plan: string | null | undefined) => planAtLeast(plan, 'pro');

/** Team with their own access (managers, kitchen) — Enterprise: "múltiples cajeros y administradores". */
export const canUseTeam = (plan: string | null | undefined) => planAtLeast(plan, 'enterprise');

/** Payment methods the customer can pick. Básico/Starter: cash and transfer; Pro adds card/QR at the counter. */
export function allowedPaymentMethods(plan: string | null | undefined, onlineConnected: boolean): string[] {
  const methods = ['cash', 'transfer'];
  if (planAtLeast(plan, 'pro')) {
    methods.push('card', 'qr');
    // A Mercado Pago account left connected doesn't enable online payments once the plan drops
    if (onlineConnected) methods.push('online');
  }
  return methods;
}

/**
 * Returns the effective plan for a tenant, accounting for active trials.
 * A tenant in 'trial' status with a future trial_ends_at is treated as 'starter'.
 * Once trial_ends_at passes, it falls back to 'gratis'.
 */
export function getEffectivePlan(tenant: {
  plan_id?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  subscription_expires_at?: string | null;
}): string {
  // Active trial → Starter-level access for 14 days
  if (
    tenant.subscription_status === 'trial' &&
    tenant.trial_ends_at &&
    new Date(tenant.trial_ends_at) > new Date()
  ) {
    return 'starter';
  }
  // Paid plan requires active status — cancelled/inactive/paused → gratis
  if (
    tenant.plan_id &&
    tenant.plan_id !== 'gratis' &&
    tenant.subscription_status === 'active' &&
    // Annual plans are one-off payments: they lapse after 12 months
    (!tenant.subscription_expires_at || new Date(tenant.subscription_expires_at) > new Date())
  ) {
    return tenant.plan_id;
  }
  return 'gratis';
}

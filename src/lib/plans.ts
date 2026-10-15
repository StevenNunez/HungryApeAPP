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
    description: 'Hungry Ape Básico — Menú digital + QR + Cocina en tiempo real',
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    currency: 'CLP',
    priceMonthly: 14990,
    priceAnnualPerMonth: 11990,
    get priceAnnualTotal() { return this.priceAnnualPerMonth * 12; }, // 143880
    description: 'Hungry Ape Starter — Menú digital + QR + Cocina en tiempo real',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    currency: 'CLP',
    priceMonthly: 29990,
    priceAnnualPerMonth: 23990,
    get priceAnnualTotal() { return this.priceAnnualPerMonth * 12; }, // 287880
    description: 'Hungry Ape Pro — Todo de Starter + Pedidos ilimitados + Analíticas',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    currency: 'CLP',
    priceMonthly: 79990,
    priceAnnualPerMonth: 63990,
    get priceAnnualTotal() { return this.priceAnnualPerMonth * 12; }, // 767880
    description: 'Hungry Ape Enterprise — Multi-sucursales + API + Manager dedicado',
  },
} as const;

export type PlanId = keyof typeof SUBSCRIPTION_PLANS;

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

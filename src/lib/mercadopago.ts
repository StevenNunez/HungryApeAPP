import { MercadoPagoConfig } from 'mercadopago';

/**
 * Mercado Pago server-side client.
 * Uses the ACCESS_TOKEN (never expose this to the browser).
 */
export const mercadoPagoClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
});

/**
 * Hungry Ape subscription plans.
 * Prices in CLP (integer — Mercado Pago does not accept decimals for CLP).
 * These must match exactly what's shown on the landing page pricing section.
 *
 * Monthly flow  → PreApproval (recurring subscription, frequency: 1 month)
 * Annual flow   → Checkout Pro (one-time payment, total = priceAnnualPerMonth * 12)
 */
export const SUBSCRIPTION_PLANS = {
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

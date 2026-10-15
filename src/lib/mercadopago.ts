import { MercadoPagoConfig } from 'mercadopago';

export { SUBSCRIPTION_PLANS, type PlanId } from './plans';

/**
 * Mercado Pago server-side client.
 * Uses the ACCESS_TOKEN (never expose this to the browser).
 * Prices live in ./plans (shared with the landing pricing section).
 */
export const mercadoPagoClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
});

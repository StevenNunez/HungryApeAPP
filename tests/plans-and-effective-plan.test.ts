import { describe, it, expect } from 'vitest';
import { getEffectivePlan } from '@/lib/data';
import { SUBSCRIPTION_PLANS, formatPlanPrice } from '@/lib/plans';

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe('getEffectivePlan', () => {
  it('trial vigente → starter', () => {
    expect(getEffectivePlan({ subscription_status: 'trial', trial_ends_at: future, plan_id: 'gratis' })).toBe('starter');
  });
  it('trial vencido → gratis', () => {
    expect(getEffectivePlan({ subscription_status: 'trial', trial_ends_at: past, plan_id: 'gratis' })).toBe('gratis');
  });
  it('plan pagado activo → su plan', () => {
    expect(getEffectivePlan({ subscription_status: 'active', plan_id: 'pro' })).toBe('pro');
  });
  it('plan anual dentro de su vigencia → su plan', () => {
    expect(getEffectivePlan({ subscription_status: 'active', plan_id: 'pro', subscription_expires_at: future })).toBe('pro');
  });
  it('plan anual vencido → gratis (aunque siga "active")', () => {
    expect(getEffectivePlan({ subscription_status: 'active', plan_id: 'pro', subscription_expires_at: past })).toBe('gratis');
  });
  it.each(['cancelled', 'paused', 'inactive'])('estado %s → gratis', (status) => {
    expect(getEffectivePlan({ subscription_status: status, plan_id: 'pro' })).toBe('gratis');
  });
  it('sin datos → gratis', () => {
    expect(getEffectivePlan({})).toBe('gratis');
  });
});

describe('SUBSCRIPTION_PLANS', () => {
  it('precios CLP enteros y el anual es 12 × precio mensual con descuento', () => {
    for (const plan of Object.values(SUBSCRIPTION_PLANS)) {
      expect(Number.isInteger(plan.priceMonthly)).toBe(true);
      expect(Number.isInteger(plan.priceAnnualTotal)).toBe(true);
      expect(plan.priceAnnualTotal).toBe(plan.priceAnnualPerMonth * 12);
      expect(plan.priceAnnualPerMonth).toBeLessThan(plan.priceMonthly);
    }
  });
  it('formatea precios al estilo chileno', () => {
    expect(formatPlanPrice(4990)).toBe('$4.990');
    expect(formatPlanPrice(79990)).toBe('$79.990');
    expect(formatPlanPrice(767880)).toBe('$767.880');
  });
});

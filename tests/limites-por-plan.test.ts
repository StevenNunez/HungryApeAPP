import { describe, it, expect } from 'vitest';
import {
  allowedPaymentMethods, canTakeOrders, canUseSupplies, canUseCashRegister, canUseReports, canUseTeam, dailyOrderLimit, productLimit, getEffectivePlan,
} from '@/lib/plans';
import { staffBlocked } from '@/lib/roles';

/** The table promised on the landing (PricingSection) — migration 020 enforces the same. */
describe('lo que incluye cada plan', () => {
  it('sin plan (terminó la prueba y no activó Básico): menú visible, pedidos en pausa', () => {
    expect(canTakeOrders('gratis')).toBe(false);
    expect(dailyOrderLimit('gratis')).toBe(0);
    expect(canTakeOrders('basico')).toBe(true);
  });

  it('pedidos por día: 40 en Básico; sin límite desde Starter', () => {
    expect(dailyOrderLimit('basico')).toBe(40);
    expect(dailyOrderLimit('starter')).toBeNull();
    expect(dailyOrderLimit('enterprise')).toBeNull();
  });

  it('productos activos: 15, Starter 100, Pro sin límite', () => {
    expect(productLimit('basico')).toBe(15);
    expect(productLimit('starter')).toBe(100);
    expect(productLimit('pro')).toBeNull();
  });

  it('caja e inventario/reportes desde Starter (no en Básico)', () => {
    expect(canUseCashRegister('basico')).toBe(false);
    expect(canUseReports('basico')).toBe(false);
    expect(canUseCashRegister('starter')).toBe(true);
    expect(canUseReports('pro')).toBe(true);
  });

  it('medios de pago: Básico y Starter efectivo y transferencia; tarjeta y online desde Pro', () => {
    expect(allowedPaymentMethods('basico', false)).toEqual(['cash', 'transfer']);
    expect(allowedPaymentMethods('starter', true)).toEqual(['cash', 'transfer']);
    expect(allowedPaymentMethods('pro', false)).toEqual(['cash', 'transfer', 'card', 'qr']);
    expect(allowedPaymentMethods('pro', true)).toContain('online');
  });

  it('insumos por receta desde Pro', () => {
    expect(canUseSupplies('starter')).toBe(false);
    expect(canUseSupplies('pro')).toBe(true);
  });

  it('equipo solo en Enterprise', () => {
    expect(canUseTeam('pro')).toBe(false);
    expect(canUseTeam('enterprise')).toBe(true);
  });

  it('la prueba de 14 días equivale a Starter (caja sí, equipo no)', () => {
    const plan = getEffectivePlan({ subscription_status: 'trial', trial_ends_at: new Date(Date.now() + 86400000).toISOString() });
    expect(plan).toBe('starter');
    expect(canUseCashRegister(plan)).toBe(true);
    expect(canUseTeam(plan)).toBe(false);
  });
});

describe('invitados cuando el plan baja', () => {
  const enterprise = { plan_id: 'enterprise', subscription_status: 'active' };
  const lapsed = { plan_id: 'enterprise', subscription_status: 'cancelled' };

  it('el dueño nunca queda bloqueado', () => {
    expect(staffBlocked('dueno', lapsed)).toBe(false);
  });

  it('encargado y cocina entran con Enterprise y quedan en pausa sin él', () => {
    expect(staffBlocked('cocina', enterprise)).toBe(false);
    expect(staffBlocked('encargado', lapsed)).toBe(true);
    expect(staffBlocked('cocina', null)).toBe(true);
  });
});

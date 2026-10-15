import { describe, it, expect } from 'vitest';
import {
  computeProfitability, computePrepTimes, computeRestockAlerts, salesByDay, rangeStart, formatMinutes,
} from '@/lib/analytics';

describe('computeProfitability', () => {
  it('calcula margen por producto con el costo congelado en la venta', () => {
    const r = computeProfitability([
      { productId: 'a', name: 'Burger', quantity: 2, price: 5000, unitCost: 2000 },
      { productId: 'a', name: 'Burger', quantity: 1, price: 5000, unitCost: 2000 },
      { productId: 'b', name: 'Bebida', quantity: 3, price: 1500, unitCost: 500 },
    ]);
    const burger = r.rows.find(x => x.name === 'Burger')!;
    expect(burger.units).toBe(3);
    expect(burger.revenue).toBe(15000);
    expect(burger.cost).toBe(6000);
    expect(burger.margin).toBe(9000);
    expect(burger.marginPct).toBeCloseTo(60);
    expect(r.revenue).toBe(19500);
    expect(r.margin).toBe(9000 + 3000);
    expect(r.coveragePct).toBe(100);
  });

  it('usa el costo actual del producto cuando la venta no lo tenía', () => {
    const r = computeProfitability(
      [{ productId: 'a', name: 'Burger', quantity: 2, price: 5000, unitCost: null }],
      { a: 1000 },
    );
    expect(r.rows[0].cost).toBe(2000);
    expect(r.rows[0].complete).toBe(true);
  });

  it('productos sin costo no inflan el margen y bajan la cobertura', () => {
    const r = computeProfitability([
      { productId: 'a', name: 'Con costo', quantity: 1, price: 1000, unitCost: 400 },
      { productId: 'b', name: 'Sin costo', quantity: 1, price: 1000, unitCost: null },
    ]);
    expect(r.revenue).toBe(2000);
    expect(r.margin).toBe(600); // solo cuenta lo que tiene costo
    expect(r.marginPct).toBeCloseTo(60);
    expect(r.coveragePct).toBe(50);
    const sin = r.rows.find(x => x.name === 'Sin costo')!;
    expect(sin.complete).toBe(false);
    expect(sin.marginPct).toBeNull();
  });

  it('sin ventas no divide por cero', () => {
    const r = computeProfitability([]);
    expect(r.marginPct).toBeNull();
    expect(r.coveragePct).toBe(0);
  });
});

describe('computePrepTimes', () => {
  const t = (min: number) => new Date(Date.UTC(2026, 0, 1, 12, min)).toISOString();
  it('promedia preparación y espera total, y agrupa por producto', () => {
    const r = computePrepTimes(
      [
        { id: 'o1', confirmed_at: t(0), preparing_at: t(2), ready_at: t(12) }, // prep 10, wait 12
        { id: 'o2', confirmed_at: t(0), preparing_at: t(1), ready_at: t(7) },  // prep 6, wait 7
        { id: 'o3', confirmed_at: t(0), preparing_at: null, ready_at: null },  // sin medir
      ],
      [
        { orderId: 'o1', productId: 'a', name: 'Burger' },
        { orderId: 'o1', productId: 'a', name: 'Burger' }, // línea repetida no duplica
        { orderId: 'o2', productId: 'a', name: 'Burger' },
        { orderId: 'o2', productId: 'b', name: 'Papas' },
        { orderId: 'o3', productId: 'a', name: 'Burger' },
      ],
    );
    expect(r.measuredOrders).toBe(2);
    expect(r.avgPrepMin).toBe(8);
    expect(r.avgWaitMin).toBe(9.5);
    const burger = r.perProduct.find(p => p.name === 'Burger')!;
    expect(burger.orders).toBe(2);
    expect(burger.avgPrepMin).toBe(8);
    expect(r.perProduct.find(p => p.name === 'Papas')!.avgPrepMin).toBe(6);
  });
  it('ignora tiempos negativos o incompletos', () => {
    const r = computePrepTimes([{ id: 'x', confirmed_at: t(5), preparing_at: t(9), ready_at: t(3) }], []);
    expect(r.avgPrepMin).toBeNull();
  });
  it('formatea minutos', () => {
    expect(formatMinutes(null)).toBe('—');
    expect(formatMinutes(0.4)).toBe('< 1 min');
    expect(formatMinutes(7.6)).toBe('8 min');
  });
});

describe('computeRestockAlerts', () => {
  it('estima el costo de reponer hasta el stock objetivo', () => {
    const r = computeRestockAlerts([
      { id: '1', name: 'Pan', stock: 2, cost: 300, restock_target: 50 },   // 48 × 300 = 14.400
      { id: '2', name: 'Queso', stock: 5, cost: 1000, restock_target: 20 },  // 15 × 1000 = 15.000
      { id: '3', name: 'Salsa', stock: 1, cost: null, restock_target: 10 }, // sin costo
      { id: '4', name: 'Papas', stock: 80, cost: 100, restock_target: 100 }, // stock alto: sin alerta
      { id: '5', name: 'Sin control', stock: null, cost: 1, restock_target: 1 },
    ]);
    expect(r.alerts.map(a => a.name)).toEqual(['Salsa', 'Pan', 'Queso']);
    expect(r.totalEstimatedCost).toBe(29400);
    expect(r.withoutCost).toBe(1);
  });
});

describe('salesByDay', () => {
  it('no mezcla lunes de semanas distintas y ordena cronológicamente', () => {
    const r = salesByDay([
      { created_at: new Date(2026, 0, 12, 10).toISOString(), total: 1000 },
      { created_at: new Date(2026, 0, 5, 10).toISOString(), total: 500 },
      { created_at: new Date(2026, 0, 12, 20).toISOString(), total: '250' },
    ]);
    expect(r).toEqual([{ name: '05/01', total: 500 }, { name: '12/01', total: 1250 }]);
  });
});

describe('rangeStart', () => {
  const now = new Date(2026, 5, 15, 15, 30);
  it('todo → null', () => expect(rangeStart('todo', now)).toBeNull());
  it('hoy → medianoche local', () => {
    const d = new Date(rangeStart('hoy', now)!);
    expect([d.getHours(), d.getMinutes(), d.getDate()]).toEqual([0, 0, 15]);
  });
  it('7d incluye hoy + 6 días previos', () => {
    expect(new Date(rangeStart('7d', now)!).getDate()).toBe(9);
  });
});

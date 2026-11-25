import { describe, it, expect } from 'vitest';
import { formatQty, formatQtyShort, parseQty, recipeCost, runOutForecast, supplyLevel, toBuy, unitsPossible } from '@/lib/insumos';

describe('cantidades de insumos', () => {
  it('muestra gramos y kilos, unidades en singular y plural', () => {
    expect(formatQty(1250, 'g')).toMatch(/1\.250 g \(1,25 kg\)/);
    expect(formatQty(1, 'unidad')).toBe('1 unidad');
    expect(formatQtyShort(3, 'unidad')).toBe('3 un.');
    expect(formatQtyShort(2500, 'ml')).toBe('2,5 l');
  });

  it('acepta coma decimal', () => {
    expect(parseQty('1,5')).toBe(1.5);
    expect(parseQty('-40')).toBe(-40);
    expect(parseQty('abc')).toBeNull();
  });
});

describe('estado y reposición', () => {
  it('agotado, bajo y ok', () => {
    expect(supplyLevel({ stock: 0, min_stock: 10 })).toBe('agotado');
    expect(supplyLevel({ stock: 8, min_stock: 10 })).toBe('bajo');
    expect(supplyLevel({ stock: 30, min_stock: 10 })).toBe('ok');
  });

  it('cuánto comprar para llegar al objetivo (un stock negativo cuenta como 0)', () => {
    expect(toBuy({ stock: 12, target_stock: 60 })).toBe(48);
    expect(toBuy({ stock: -3, target_stock: 10 })).toBe(10);
    expect(toBuy({ stock: 5, target_stock: null })).toBeNull();
  });
});

describe('recetas', () => {
  const supplies = new Map([
    ['pan', { stock: 10, cost_per_unit: 150 }],
    ['vienesa', { stock: 4, cost_per_unit: 250 }],
    ['palta', { stock: 300, cost_per_unit: 8 }],
  ]);
  const completo = [{ supply_id: 'pan', quantity: 1 }, { supply_id: 'vienesa', quantity: 1 }, { supply_id: 'palta', quantity: 60 }];

  it('el costo sale de la receta', () => {
    expect(recipeCost(completo, supplies)).toBe(150 + 250 + 480);
  });

  it('alcanza para lo que permita el insumo más escaso', () => {
    expect(unitsPossible(completo, supplies)).toBe(4);
  });

  it('sin costo de algún insumo no inventa un número', () => {
    expect(recipeCost([{ supply_id: 'x', quantity: 1 }], new Map([['x', { cost_per_unit: null }]]))).toBeNull();
  });
});

describe('cuándo se acaba', () => {
  it('proyecta con el ritmo de venta del día', () => {
    const now = new Date('2026-11-24T16:00:00Z');
    // 20 panes vendidos en 2 horas → 10 por hora; quedan 15 → 1,5 horas
    const sales = [
      { quantity: -10, created_at: '2026-11-24T14:00:00Z' },
      { quantity: -10, created_at: '2026-11-24T15:30:00Z' },
    ];
    const at = runOutForecast(15, sales, now)!;
    expect(at.toISOString()).toBe('2026-11-24T17:30:00.000Z');
  });

  it('sin ventas o con poca historia no adivina', () => {
    expect(runOutForecast(15, [], new Date())).toBeNull();
    expect(runOutForecast(15, [{ quantity: -1, created_at: new Date().toISOString() }], new Date())).toBeNull();
  });
});

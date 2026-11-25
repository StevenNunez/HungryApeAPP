import { describe, it, expect, vi } from 'vitest';

// data.ts / product-private.ts import the browser Supabase client; these tests only use pure helpers
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));

import { startOfTodayInChile } from '@/lib/data';
import { splitPrivate, withPrivate } from '@/lib/product-private';

describe('startOfTodayInChile', () => {
  it('usa la medianoche de Chile en verano (UTC-3), no la del navegador', () => {
    // 24-11-2026 15:30 en Santiago = 18:30 UTC
    expect(startOfTodayInChile(new Date('2026-11-24T18:30:00Z'))).toBe('2026-11-24T03:00:00.000Z');
  });

  it('a las 01:00 de Chile ya es el día nuevo aunque en UTC siga siendo de madrugada', () => {
    // 25-11-2026 01:00 en Santiago = 04:00 UTC
    expect(startOfTodayInChile(new Date('2026-11-25T04:00:00Z'))).toBe('2026-11-25T03:00:00.000Z');
  });

  it('usa UTC-4 en invierno', () => {
    // 15-07-2026 12:00 en Santiago = 16:00 UTC
    expect(startOfTodayInChile(new Date('2026-07-15T16:00:00Z'))).toBe('2026-07-15T04:00:00.000Z');
  });
});

describe('costos privados de producto', () => {
  it('separa costo y meta de reposición de las columnas públicas', () => {
    const { publicFields, privateFields } = splitPrivate({
      id: 'p1', name: 'Burger', price: 5990, cost: 2100, restock_target: 30,
    });
    expect(publicFields).toEqual({ id: 'p1', name: 'Burger', price: 5990 });
    expect(privateFields).toEqual({ cost: 2100, restock_target: 30 });
  });

  it('un campo vacío del formulario se guarda como null', () => {
    const { privateFields } = splitPrivate({ id: 'p1', cost: '', restock_target: undefined });
    expect(privateFields).toEqual({ cost: null, restock_target: null });
  });

  it('mezcla los costos con los productos y deja null donde no hay', () => {
    const merged = withPrivate([{ id: 'a' }, { id: 'b' }], { a: { cost: 1000, restock_target: null } });
    expect(merged).toEqual([
      { id: 'a', cost: 1000, restock_target: null },
      { id: 'b', cost: null, restock_target: null },
    ]);
  });
});

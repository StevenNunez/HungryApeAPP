import { describe, it, expect } from 'vitest';
import { computeArqueo, computeTotals, parseAmount, elapsed, type CajaOrder, type CashSession, type Withdrawal } from '@/lib/caja';

const order = (payment_method: string, total: number | string): CajaOrder => ({
  id: Math.random().toString(36), nickname: 'X', short_id: 1, payment_method, total: total as number, status: 'Entregado', created_at: '2026-11-24T15:00:00Z',
});
const session = (opening: number, closing: number | null = null): CashSession => ({
  id: 's1', tenant_id: 't1', opened_at: '2026-11-24T12:00:00Z', opening_amount: opening, closed_at: null, closing_amount: closing, notes: '', status: 'open',
});
const wd = (amount: number): Withdrawal => ({ id: 'w', session_id: 's1', amount, reason: 'Proveedor', created_at: '2026-11-24T13:00:00Z' });

describe('totales de caja', () => {
  it('suma por medio de pago, incluido el pago online', () => {
    const { byMethod, total } = computeTotals([order('cash', 5000), order('card', 3000), order('online', 2000), order('cash', '1500')]);
    expect(byMethod).toMatchObject({ cash: 6500, card: 3000, online: 2000, transfer: 0, qr: 0 });
    expect(total).toBe(11500);
  });
});

describe('arqueo', () => {
  it('efectivo esperado = apertura + ventas en efectivo − egresos (tarjeta y online no van al cajón)', () => {
    const r = computeArqueo(session(20000), [order('cash', 10000), order('card', 8000), order('online', 4000)], [wd(3000)], 27000);
    expect(r.expectedCash).toBe(27000);
    expect(r.diff).toBe(0);
    expect(r.total).toBe(22000);
  });

  it('marca faltante y sobrante', () => {
    expect(computeArqueo(session(0), [order('cash', 10000)], [], 9000).diff).toBe(-1000);
    expect(computeArqueo(session(0), [order('cash', 10000)], [], 10500).diff).toBe(500);
  });

  it('en el historial usa el monto contado guardado en la sesión', () => {
    expect(computeArqueo(session(1000, 1000), [], []).diff).toBe(0);
  });
});

describe('montos escritos por una persona', () => {
  it('acepta puntos de miles y signo peso', () => {
    expect(parseAmount('15.000')).toBe(15000);
    expect(parseAmount('$ 2.500')).toBe(2500);
    expect(parseAmount('0')).toBe(0);
  });
  it('rechaza lo que no es número', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('mil')).toBeNull();
  });
});

describe('tiempo abierta', () => {
  it('muestra horas y minutos', () => {
    const t0 = new Date('2026-11-24T12:00:00Z').getTime();
    expect(elapsed('2026-11-24T12:00:00Z', t0 + 95 * 60000)).toBe('1h 35m');
    expect(elapsed('2026-11-24T12:00:00Z', t0 + 7 * 60000)).toBe('7m');
  });
});

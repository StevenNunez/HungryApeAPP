import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const paymentGet = vi.fn();
vi.mock('mercadopago', () => ({
  Payment: class { get = paymentGet; },
  PreApproval: class {},
  MercadoPagoConfig: class {},
}));

const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: 't1' } }) }) }) }),
  }),
  createServiceSupabaseClient: vi.fn(),
}));

const activateTenant = vi.fn();
vi.mock('@/lib/billing', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing')>('@/lib/billing');
  return { ...actual, activateTenant };
});

const { POST } = await import('@/app/api/mercadopago/sync-payment/route');
const call = () =>
  POST(new NextRequest('http://localhost/api/mercadopago/sync-payment', {
    method: 'POST',
    body: JSON.stringify({ paymentId: '1' }),
  }));
const payment = (over: object = {}) => ({
  id: 1,
  status: 'approved',
  transaction_amount: 287880,
  date_approved: new Date(Date.now() - 3_600_000).toISOString(),
  external_reference: JSON.stringify({ tenantId: 't1', userId: 'u1', planId: 'pro' }),
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('POST /api/mercadopago/sync-payment', () => {
  it('sin sesión → 401', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401);
    expect(paymentGet).not.toHaveBeenCalled();
  });
  it('pago de OTRO negocio → 403', async () => {
    paymentGet.mockResolvedValue(payment({ external_reference: JSON.stringify({ tenantId: 'otro', planId: 'pro' }) }));
    expect((await call()).status).toBe(403);
    expect(activateTenant).not.toHaveBeenCalled();
  });
  it('pago de hace más de 48 h → 400 (no sirve para reactivar con un pago viejo)', async () => {
    paymentGet.mockResolvedValue(payment({ date_approved: new Date(Date.now() - 72 * 3_600_000).toISOString() }));
    expect((await call()).status).toBe(400);
    expect(activateTenant).not.toHaveBeenCalled();
  });
  it('monto que no corresponde al plan → 400', async () => {
    paymentGet.mockResolvedValue(payment({ transaction_amount: 10 }));
    expect((await call()).status).toBe(400);
  });
  it('pago propio, reciente y completo → activa', async () => {
    paymentGet.mockResolvedValue(payment());
    const res = await call();
    expect(res.status).toBe(200);
    expect(activateTenant).toHaveBeenCalledWith('t1', 'pro', '1', expect.objectContaining({ annual: true }));
  });
});

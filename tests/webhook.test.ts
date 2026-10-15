import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';

// ── Mocks ─────────────────────────────────────────────────────────────────────
const paymentGet = vi.fn();
const preapprovalGet = vi.fn();
vi.mock('mercadopago', () => ({
  Payment: class { get = paymentGet; },
  PreApproval: class { get = preapprovalGet; },
  MercadoPagoConfig: class {},
}));

const activateTenant = vi.fn();
const resolveTenantId = vi.fn();
const storePendingActivation = vi.fn();
vi.mock('@/lib/billing', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing')>('@/lib/billing');
  return { ...actual, activateTenant, resolveTenantId, storePendingActivation };
});
vi.mock('@/lib/supabase/server', () => ({ createServiceSupabaseClient: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendWelcomeEmail: vi.fn() }));

const SECRET = 'whsec_test';
const { POST } = await import('@/app/api/mercadopago/webhook/route');

function sign(dataId: string, ts = '1700000000', requestId = 'req-1') {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${createHmac('sha256', SECRET).update(manifest).digest('hex')}`;
}
function webhook(body: object, headers: Record<string, string> = {}) {
  const id = String((body as any).data?.id ?? '');
  return new NextRequest(`http://localhost/api/mercadopago/webhook?data.id=${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
const paymentEvent = { type: 'payment', data: { id: '999' } };
const approved = (over: object = {}) => ({
  id: 999,
  status: 'approved',
  transaction_amount: 287880, // pro anual
  date_approved: '2026-10-01T12:00:00.000-03:00',
  external_reference: JSON.stringify({ tenantId: 't1', userId: 'u1', planId: 'pro', isAnnual: true }),
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
  resolveTenantId.mockImplementation(async (t: string | null) => t);
});

describe('webhook Mercado Pago', () => {
  it('firma inválida → 401 y no toca nada', async () => {
    const res = await POST(webhook(paymentEvent, { 'x-signature': 'ts=1,v1=deadbeef', 'x-request-id': 'req-1' }));
    expect(res.status).toBe(401);
    expect(paymentGet).not.toHaveBeenCalled();
    expect(activateTenant).not.toHaveBeenCalled();
  });

  it('firma válida + pago anual aprobado → activa con vigencia anual', async () => {
    paymentGet.mockResolvedValue(approved());
    const res = await POST(webhook(paymentEvent, { 'x-signature': sign('999'), 'x-request-id': 'req-1' }));
    expect(res.status).toBe(200);
    expect(activateTenant).toHaveBeenCalledWith('t1', 'pro', '999', expect.objectContaining({ annual: true }));
  });

  it('sin header x-signature (IPN) se acepta, porque el pago se re-consulta a MP', async () => {
    paymentGet.mockResolvedValue(approved());
    const res = await POST(webhook(paymentEvent));
    expect(res.status).toBe(200);
    expect(paymentGet).toHaveBeenCalledWith({ id: '999' });
    expect(activateTenant).toHaveBeenCalledTimes(1);
  });

  it('monto menor al del plan → se ignora', async () => {
    paymentGet.mockResolvedValue(approved({ transaction_amount: 100 }));
    const res = await POST(webhook(paymentEvent));
    expect(res.status).toBe(200);
    expect(activateTenant).not.toHaveBeenCalled();
  });

  it('pago no aprobado → no activa', async () => {
    paymentGet.mockResolvedValue(approved({ status: 'pending' }));
    await POST(webhook(paymentEvent));
    expect(activateTenant).not.toHaveBeenCalled();
  });

  it('plan desconocido en la referencia → no activa', async () => {
    paymentGet.mockResolvedValue(approved({ external_reference: JSON.stringify({ tenantId: 't1', planId: 'gratis-total' }) }));
    await POST(webhook(paymentEvent));
    expect(activateTenant).not.toHaveBeenCalled();
  });

  it('pago antes de registrarse → queda en pending_activations', async () => {
    resolveTenantId.mockResolvedValue(null);
    paymentGet.mockResolvedValue(approved({
      external_reference: JSON.stringify({ planId: 'pro', email: 'nuevo@correo.cl', isPreRegistration: true, isAnnual: true }),
    }));
    const res = await POST(webhook(paymentEvent));
    expect(res.status).toBe(200);
    expect(activateTenant).not.toHaveBeenCalled();
    expect(storePendingActivation).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'nuevo@correo.cl', planId: 'pro', paymentId: '999', annual: true }),
    );
  });

  it('si falla la activación responde 500 para que MP reintente', async () => {
    paymentGet.mockResolvedValue(approved());
    activateTenant.mockRejectedValue(new Error('db down'));
    const res = await POST(webhook(paymentEvent));
    expect(res.status).toBe(500);
  });

  it('suscripción mensual autorizada → activa sin vigencia anual', async () => {
    preapprovalGet.mockResolvedValue({
      id: 'pre-1',
      status: 'authorized',
      external_reference: JSON.stringify({ tenantId: 't1', planId: 'starter' }),
    });
    const res = await POST(webhook({ type: 'subscription_preapproval', data: { id: 'pre-1' } }));
    expect(res.status).toBe(200);
    expect(activateTenant).toHaveBeenCalledWith('t1', 'starter', 'pre-1', { annual: false });
  });
});

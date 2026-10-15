import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';
import { fakeSupabase, type Call } from './helpers/fake-supabase';

let service = fakeSupabase(() => undefined);
let sessionUser: { id: string } | null = null;
let sessionTenant: any = null;

vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabaseClient: () => service.client,
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: sessionTenant }) }) }) }),
  }),
}));

const KEY = 'a'.repeat(64);
const TENANT = '22222222-2222-4222-8222-222222222222';
const ORDER = '11111111-1111-4111-8111-111111111111';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  service = fakeSupabase(() => undefined);
  sessionUser = null;
  sessionTenant = null;
  process.env.PAYMENTS_ENC_KEY = KEY;
  process.env.MP_CLIENT_ID = 'cid';
  process.env.MP_CLIENT_SECRET = 'csecret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://ape.test';
  delete process.env.MP_MARKETPLACE_FEE_PERCENT;
  delete process.env.MP_MARKETPLACE_WEBHOOK_SECRET;
  delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
});
afterEach(() => vi.unstubAllGlobals());

// ── crypto ────────────────────────────────────────────────────────────────────
describe('crypto', async () => {
  const { encryptSecret, decryptSecret, signState, verifyState } = await import('@/lib/crypto');

  it('cifra y descifra; el valor guardado no contiene el texto original', () => {
    const enc = encryptSecret('APP_USR-token-secreto');
    expect(enc).not.toContain('APP_USR');
    expect(decryptSecret(enc)).toBe('APP_USR-token-secreto');
  });
  it('dos cifrados del mismo valor son distintos (IV aleatorio)', () => {
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'));
  });
  it('detecta manipulación del texto cifrado', () => {
    const parts = encryptSecret('hola').split('.');
    parts[3] = Buffer.from('otro-contenido').toString('base64url');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });
  it('sin llave configurada falla (no cifra con una llave por defecto)', () => {
    delete process.env.PAYMENTS_ENC_KEY;
    expect(() => encryptSecret('x')).toThrow(/PAYMENTS_ENC_KEY/);
  });
  it('state OAuth: válido, adulterado y expirado', () => {
    const s = signState({ tenantId: TENANT });
    expect(verifyState(s)).toEqual({ tenantId: TENANT });
    const [body, sig] = s.split('.');
    const forged = Buffer.from(JSON.stringify({ tenantId: 'otro', exp: Date.now() + 1e6 })).toString('base64url');
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
    expect(verifyState(`${body}.zzz`)).toBeNull();
    expect(verifyState(signState({ tenantId: TENANT }, -1000))).toBeNull();
    expect(verifyState(null)).toBeNull();
  });
});

// ── marketplace fee ───────────────────────────────────────────────────────────
describe('marketplaceFee', async () => {
  const { marketplaceFee } = await import('@/lib/mp-seller');
  it('0 por defecto', () => expect(marketplaceFee(10000)).toBe(0));
  it('porcentaje redondeado a CLP entero', () => {
    process.env.MP_MARKETPLACE_FEE_PERCENT = '2.5';
    expect(marketplaceFee(10990)).toBe(275);
  });
  it('tope de 10 % aunque se configure más', () => {
    process.env.MP_MARKETPLACE_FEE_PERCENT = '40';
    expect(marketplaceFee(10000)).toBe(1000);
  });
});

// ── connect flow ──────────────────────────────────────────────────────────────
describe('OAuth connect', async () => {
  const { GET: start } = await import('@/app/api/payments/connect/start/route');
  const { GET: callback } = await import('@/app/api/payments/connect/callback/route');
  const { signState } = await import('@/lib/crypto');

  const proTenant = { id: TENANT, plan_id: 'pro', subscription_status: 'active' };

  it('start: sin sesión → login', async () => {
    const res = await start(new NextRequest('https://ape.test/api/payments/connect/start'));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
  });
  it('start: plan sin Pro → vuelve a configuración avisando', async () => {
    sessionUser = { id: 'u1' };
    sessionTenant = { id: TENANT, plan_id: 'starter', subscription_status: 'active' };
    const res = await start(new NextRequest('https://ape.test/api/payments/connect/start'));
    expect(res.headers.get('location')).toContain('pagos=requiere-pro');
  });
  it('start: Pro → redirige a Mercado Pago con state firmado y redirect_uri', async () => {
    sessionUser = { id: 'u1' };
    sessionTenant = proTenant;
    const res = await start(new NextRequest('https://ape.test/api/payments/connect/start'));
    const loc = new URL(res.headers.get('location')!);
    expect(loc.host).toBe('auth.mercadopago.cl');
    expect(loc.searchParams.get('client_id')).toBe('cid');
    expect(loc.searchParams.get('redirect_uri')).toBe('https://ape.test/api/payments/connect/callback');
    expect(loc.searchParams.get('state')).toBeTruthy();
  });
  it('callback: state de OTRO negocio → error y no guarda nada', async () => {
    sessionUser = { id: 'u1' };
    sessionTenant = { id: 'mi-negocio' };
    const state = signState({ tenantId: TENANT });
    const res = await callback(new NextRequest(`https://ape.test/api/payments/connect/callback?code=abc&state=${state}`));
    expect(res.headers.get('location')).toContain('pagos=error');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.calls).toHaveLength(0);
  });
  it('callback: state falso → error', async () => {
    sessionUser = { id: 'u1' };
    sessionTenant = { id: TENANT };
    const res = await callback(new NextRequest('https://ape.test/api/payments/connect/callback?code=abc&state=falso.falso'));
    expect(res.headers.get('location')).toContain('pagos=error');
  });
  it('callback válido → intercambia el código y guarda los tokens CIFRADOS', async () => {
    sessionUser = { id: 'u1' };
    sessionTenant = { id: TENANT };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 'APP_USR-abc', refresh_token: 'TG-ref', expires_in: 15552000, user_id: 777 }) });
    const state = signState({ tenantId: TENANT });
    const res = await callback(new NextRequest(`https://ape.test/api/payments/connect/callback?code=abc&state=${state}`));
    expect(res.headers.get('location')).toContain('pagos=conectado');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/oauth/token');
    expect(JSON.parse(init.body)).toMatchObject({ grant_type: 'authorization_code', code: 'abc', client_id: 'cid' });

    const saved = service.calls.find(c => c.op === 'upsert')!;
    expect(saved.payload.tenant_id).toBe(TENANT);
    expect(saved.payload.access_token_enc).not.toContain('APP_USR');
    expect(saved.payload.refresh_token_enc).not.toContain('TG-ref');
    expect(saved.payload.mp_user_id).toBe('777');
  });
});

// ── POST /api/orders/:id/pay ──────────────────────────────────────────────────
describe('POST /api/orders/[id]/pay', async () => {
  const { POST } = await import('@/app/api/orders/[id]/pay/route');
  const { encryptSecret } = await import('@/lib/crypto');
  let ip = 0;
  const call = (id = ORDER) => POST(new NextRequest(`https://ape.test/api/orders/${id}/pay`, { method: 'POST', headers: { 'x-forwarded-for': `10.1.0.${++ip}` } }),
    { params: Promise.resolve({ id }) });

  const world = (order: object) => {
    service = fakeSupabase((c: Call) => {
      if (c.table === 'orders') return { data: { id: ORDER, tenant_id: TENANT, status: 'Por Pagar', payment_method: 'online', total: '12990.00', short_id: 4, pickup_code: 'AB12', paid_online: false, ...order } };
      if (c.table === 'tenants') return { data: { id: TENANT, slug: 'mi-truck', name: 'Mi Truck' } };
      if (c.table === 'tenant_payment_accounts') return { data: { access_token_enc: encryptSecret('APP_USR-seller'), refresh_token_enc: null, expires_at: null } };
    });
  };

  it('crea la preferencia en la cuenta DEL LOCAL con el monto de la base de datos', async () => {
    world({});
    process.env.MP_MARKETPLACE_FEE_PERCENT = '3';
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ init_point: 'https://mp.test/checkout/123' }) });

    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe('https://mp.test/checkout/123');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
    expect(init.headers.Authorization).toBe('Bearer APP_USR-seller'); // token del vendedor, no el nuestro
    const body = JSON.parse(init.body);
    expect(body.items[0].unit_price).toBe(12990);
    expect(body.marketplace_fee).toBe(390); // 3 % de 12.990
    expect(JSON.parse(body.external_reference)).toEqual({ orderId: ORDER, tenantId: TENANT });
    expect(body.notification_url).toBe(`https://ape.test/api/mercadopago/orders-webhook?tenant=${TENANT}`);
  });
  it('pedido que no es de pago online → 409', async () => {
    world({ payment_method: 'cash' });
    expect((await call()).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('pedido ya pagado → 409', async () => {
    world({ paid_online: true });
    expect((await call()).status).toBe(409);
  });
  it('id inválido → 400; sin configuración → 503', async () => {
    expect((await call('x')).status).toBe(400);
    delete process.env.MP_CLIENT_ID;
    world({});
    expect((await call()).status).toBe(503);
  });
  it('si Mercado Pago falla → 502 sin filtrar detalles', async () => {
    world({});
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'secreto interno' }) });
    const res = await call();
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('secreto');
  });
});

// ── Orders webhook ────────────────────────────────────────────────────────────
describe('POST /api/mercadopago/orders-webhook', async () => {
  const { POST } = await import('@/app/api/mercadopago/orders-webhook/route');
  const { encryptSecret } = await import('@/lib/crypto');

  const hook = (query = `tenant=${TENANT}`, headers: Record<string, string> = {}, body: object = { type: 'payment', data: { id: '555' } }) =>
    POST(new NextRequest(`https://ape.test/api/mercadopago/orders-webhook?${query}&data.id=555`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
    }));

  const world = (order: object = {}) => {
    service = fakeSupabase((c: Call) => {
      if (c.table === 'tenant_payment_accounts') return { data: { access_token_enc: encryptSecret('APP_USR-seller'), refresh_token_enc: null, expires_at: null } };
      if (c.table === 'orders' && c.op === 'select') return { data: { id: ORDER, tenant_id: TENANT, status: 'Por Pagar', total: '12990', payment_method: 'online', paid_online: false, ...order } };
    });
  };
  const payment = (over: object = {}) => ({ ok: true, status: 200, json: async () => ({ id: 555, status: 'approved', transaction_amount: 12990, external_reference: JSON.stringify({ orderId: ORDER, tenantId: TENANT }), ...over }) });

  it('pago aprobado y por el monto correcto → marca pagado y pasa a Pendiente', async () => {
    world();
    fetchMock.mockResolvedValue(payment());
    expect((await hook()).status).toBe(200);
    const upd = service.calls.find(c => c.table === 'orders' && c.op === 'update')!;
    expect(upd.payload).toMatchObject({ paid_online: true, online_payment_id: '555', status: 'Pendiente' });
  });
  it('monto menor al total → se ignora', async () => {
    world();
    fetchMock.mockResolvedValue(payment({ transaction_amount: 100 }));
    await hook();
    expect(service.calls.some(c => c.op === 'update')).toBe(false);
  });
  it('pago de otro pedido/local en la referencia → se ignora', async () => {
    world();
    fetchMock.mockResolvedValue(payment({ external_reference: JSON.stringify({ orderId: ORDER, tenantId: 'otro-local' }) }));
    await hook();
    expect(service.calls.some(c => c.op === 'update')).toBe(false);
  });
  it('pago no aprobado → se ignora', async () => {
    world();
    fetchMock.mockResolvedValue(payment({ status: 'pending' }));
    await hook();
    expect(service.calls.some(c => c.op === 'update')).toBe(false);
  });
  it('idempotente: un pedido ya pagado no se vuelve a tocar', async () => {
    world({ paid_online: true });
    fetchMock.mockResolvedValue(payment());
    await hook();
    expect(service.calls.some(c => c.op === 'update')).toBe(false);
  });
  it('firma inválida → 401 sin llamar a Mercado Pago', async () => {
    process.env.MP_MARKETPLACE_WEBHOOK_SECRET = 'whsec';
    world();
    const res = await hook(`tenant=${TENANT}`, { 'x-signature': 'ts=1,v1=deadbeef', 'x-request-id': 'r1' });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('firma válida → procesa', async () => {
    process.env.MP_MARKETPLACE_WEBHOOK_SECRET = 'whsec';
    world();
    fetchMock.mockResolvedValue(payment());
    const ts = '1700000000';
    const v1 = createHmac('sha256', 'whsec').update(`id:555;request-id:r1;ts:${ts};`).digest('hex');
    const res = await hook(`tenant=${TENANT}`, { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'r1' });
    expect(res.status).toBe(200);
    expect(service.calls.some(c => c.op === 'update')).toBe(true);
  });
  it('tenant inválido → 400; fallo de base de datos → 500 para que MP reintente', async () => {
    expect((await hook('tenant=nope')).status).toBe(400);
    service = fakeSupabase((c: Call) => {
      if (c.table === 'tenant_payment_accounts') return { data: { access_token_enc: encryptSecret('t'), refresh_token_enc: null, expires_at: null } };
      if (c.table === 'orders' && c.op === 'select') return { data: { id: ORDER, tenant_id: TENANT, status: 'Por Pagar', total: '12990', payment_method: 'online', paid_online: false } };
      if (c.table === 'orders' && c.op === 'update') return { error: { message: 'db down' } };
    });
    fetchMock.mockResolvedValue(payment());
    expect((await hook()).status).toBe(500);
  });
});

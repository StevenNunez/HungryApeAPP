import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';
import { fakeSupabase, type Call } from './helpers/fake-supabase';

// ── Shared mocks ─────────────────────────────────────────────────────────────
let service = fakeSupabase(() => undefined);
let sessionUser: { id: string } | null = null;

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (fn: () => unknown) => { void fn(); } }; // run alerts immediately in tests
});
vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabaseClient: () => service.client,
  createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
}));
const sendPushForOrder = vi.fn();
vi.mock('@/lib/push', async () => {
  const actual = await vi.importActual<typeof import('@/lib/push')>('@/lib/push');
  return { ...actual, sendPushForOrder };
});
const sendWhatsAppText = vi.fn();
vi.mock('@/lib/whatsapp', async () => {
  const actual = await vi.importActual<typeof import('@/lib/whatsapp')>('@/lib/whatsapp');
  return { ...actual, sendWhatsAppText };
});

const DEMO = 'a0000000-0000-0000-0000-000000000001';
const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const PRO_TENANT = { id: 't-pro', slug: 'mi-truck', name: 'Mi Truck', owner_id: 'owner-1', plan_id: 'pro', subscription_status: 'active' };
const FREE_TENANT = { id: 't-free', slug: 'otro', name: 'Otro', owner_id: 'owner-2', plan_id: 'gratis', subscription_status: 'trial' };

beforeEach(() => {
  vi.resetAllMocks();
  sessionUser = null;
  service = fakeSupabase(() => undefined);
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pub';
  process.env.VAPID_PRIVATE_KEY = 'priv';
  process.env.VAPID_SUBJECT = 'mailto:a@b.cl';
  process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
  process.env.WHATSAPP_APP_SECRET = 'appsecret';
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = '56911112222';
  process.env.NEXT_PUBLIC_APP_URL = 'https://ape.test';
});

// ── Pure helpers ─────────────────────────────────────────────────────────────
describe('isAllowedPushEndpoint (anti-SSRF)', async () => {
  const { isAllowedPushEndpoint } = await import('@/lib/push');
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-par02p.notify.windows.com/?token=abc',
  ])('acepta %s', (u) => expect(isAllowedPushEndpoint(u)).toBe(true));
  it.each([
    'http://fcm.googleapis.com/x',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost:3000/x',
    'https://fcm.googleapis.com.evil.com/x',
    'https://user:pw@fcm.googleapis.com/x',
    'not a url',
    42,
  ])('rechaza %s', (u) => expect(isAllowedPushEndpoint(u as any)).toBe(false));
});

describe('whatsapp helpers', async () => {
  const { extractLinkToken, verifyWhatsAppSignature, newLinkToken, buildWhatsAppLink } = await import('@/lib/whatsapp');
  it('extrae el código del mensaje, sin distinguir mayúsculas', () => {
    expect(extractLinkToken('Hola 👋 Avísame cuando mi pedido esté listo. Ref: HA-abcd2345')).toBe('ABCD2345');
    expect(extractLinkToken('sin código')).toBeNull();
    expect(extractLinkToken(undefined)).toBeNull();
  });
  it('genera códigos de 8 caracteres sin letras ambiguas', () => {
    for (let i = 0; i < 50; i++) expect(newLinkToken()).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  });
  it('valida la firma de Meta con el cuerpo crudo', () => {
    const body = '{"a":1}';
    const sig = 'sha256=' + createHmac('sha256', 'appsecret').update(body).digest('hex');
    expect(verifyWhatsAppSignature(body, sig)).toBe(true);
    expect(verifyWhatsAppSignature(body + ' ', sig)).toBe(false);
    expect(verifyWhatsAppSignature(body, null)).toBe(false);
    expect(verifyWhatsAppSignature(body, 'sha256=abc')).toBe(false);
  });
  it('arma el enlace wa.me con el código', () => {
    const url = buildWhatsAppLink('ABCD2345');
    expect(url.startsWith('https://wa.me/56911112222?text=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('HA-ABCD2345');
  });
});

// ── PATCH /api/orders/:id/status ─────────────────────────────────────────────
describe('PATCH /api/orders/[id]/status', async () => {
  const { PATCH } = await import('@/app/api/orders/[id]/status/route');
  const call = (id: string, status: unknown) =>
    PATCH(new NextRequest(`http://localhost/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      { params: Promise.resolve({ id }) });

  const withOrder = (order: any, tenant: any) => {
    service = fakeSupabase((c: Call) => {
      if (c.table === 'orders' && c.op === 'select') return { data: order };
      if (c.table === 'tenants' && c.op === 'select') return { data: tenant };
    });
  };

  it('id o estado inválidos → 400', async () => {
    expect((await call('nope', 'Listo')).status).toBe(400);
    expect((await call(ORDER_ID, 'Hackeado')).status).toBe(400);
  });
  it('sin sesión en un local real → 401', async () => {
    withOrder({ id: ORDER_ID, status: 'En preparación', tenant_id: 't-pro' }, { owner_id: 'owner-1' });
    expect((await call(ORDER_ID, 'Listo')).status).toBe(401);
  });
  it('usuario que NO es el dueño → 403', async () => {
    sessionUser = { id: 'intruso' };
    withOrder({ id: ORDER_ID, status: 'En preparación', tenant_id: 't-pro' }, { owner_id: 'owner-1' });
    expect((await call(ORDER_ID, 'Listo')).status).toBe(403);
  });
  it('no permite retroceder un pedido → 409', async () => {
    sessionUser = { id: 'owner-1' };
    withOrder({ id: ORDER_ID, status: 'Listo', tenant_id: 't-pro' }, { owner_id: 'owner-1' });
    expect((await call(ORDER_ID, 'Pendiente')).status).toBe(409);
  });
  it('dueño avanza a "Listo" → actualiza y dispara los avisos', async () => {
    sessionUser = { id: 'owner-1' };
    withOrder({ id: ORDER_ID, status: 'En preparación', tenant_id: 't-pro' }, { owner_id: 'owner-1' });
    const notify = vi.spyOn(await import('@/lib/notify'), 'notifyOrderReady').mockResolvedValue({ push: 0, whatsapp: 0 });
    const res = await call(ORDER_ID, 'Listo');
    expect(res.status).toBe(200);
    expect(service.calls.some(c => c.table === 'orders' && c.op === 'update' && c.payload.status === 'Listo')).toBe(true);
    expect(notify).toHaveBeenCalledWith(ORDER_ID);
  });
  it('otros estados no disparan avisos', async () => {
    sessionUser = { id: 'owner-1' };
    withOrder({ id: ORDER_ID, status: 'Pendiente', tenant_id: 't-pro' }, { owner_id: 'owner-1' });
    const notify = vi.spyOn(await import('@/lib/notify'), 'notifyOrderReady').mockResolvedValue({ push: 0, whatsapp: 0 });
    expect((await call(ORDER_ID, 'En preparación')).status).toBe(200);
    expect(notify).not.toHaveBeenCalled();
  });
  it('la cocina demo anónima sí puede avanzar pedidos', async () => {
    withOrder({ id: ORDER_ID, status: 'Pendiente', tenant_id: DEMO }, null);
    expect((await call(ORDER_ID, 'En preparación')).status).toBe(200);
  });
});

// ── notifyOrderReady ─────────────────────────────────────────────────────────
describe('notifyOrderReady', async () => {
  const { notifyOrderReady } = await import('@/lib/notify');
  const order = { id: ORDER_ID, short_id: 7, pickup_code: 'AB12', tenant_id: 't-pro' };

  it('local Pro con push y WhatsApp vinculados → avisa por ambos y borra el teléfono', async () => {
    service = fakeSupabase((c) => {
      if (c.table === 'orders') return { data: order };
      if (c.table === 'tenants') return { data: PRO_TENANT };
      if (c.table === 'whatsapp_links' && c.op === 'select') {
        return { data: [{ id: 'l1', wa_id: '56999', linked_at: new Date().toISOString() }] };
      }
    });
    sendPushForOrder.mockResolvedValue(1);
    sendWhatsAppText.mockResolvedValue(true);

    const r = await notifyOrderReady(ORDER_ID);
    expect(r).toEqual({ push: 1, whatsapp: 1 });
    expect(sendWhatsAppText).toHaveBeenCalledWith('56999', expect.stringContaining('AB12'));
    const cleared = service.calls.find(c => c.table === 'whatsapp_links' && c.op === 'update');
    expect(cleared?.payload.wa_id).toBeNull();
  });

  it('local sin plan Pro → no envía nada', async () => {
    service = fakeSupabase((c) => {
      if (c.table === 'orders') return { data: { ...order, tenant_id: 't-free' } };
      if (c.table === 'tenants') return { data: FREE_TENANT };
    });
    expect(await notifyOrderReady(ORDER_ID)).toEqual({ push: 0, whatsapp: 0 });
    expect(sendPushForOrder).not.toHaveBeenCalled();
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it('no escribe por WhatsApp si la ventana de 24 h ya se cerró (evita plantillas con costo)', async () => {
    service = fakeSupabase((c) => {
      if (c.table === 'orders') return { data: order };
      if (c.table === 'tenants') return { data: PRO_TENANT };
      if (c.table === 'whatsapp_links') {
        return { data: [{ id: 'l1', wa_id: '56999', linked_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() }] };
      }
    });
    sendPushForOrder.mockResolvedValue(0);
    await notifyOrderReady(ORDER_ID);
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it('un fallo interno nunca lanza error (la cocina no depende de esto)', async () => {
    service = fakeSupabase(() => { throw new Error('db caída'); });
    await expect(notifyOrderReady(ORDER_ID)).resolves.toEqual({ push: 0, whatsapp: 0 });
  });
});

// ── POST /api/push/subscribe ─────────────────────────────────────────────────
describe('POST /api/push/subscribe', async () => {
  const { POST } = await import('@/app/api/push/subscribe/route');
  let ipCounter = 0;
  const call = (body: any) =>
    POST(new NextRequest('http://localhost/api/push/subscribe', {
      method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${++ipCounter}` }, body: JSON.stringify(body),
    }));
  const sub = (endpoint = 'https://fcm.googleapis.com/fcm/send/xyz') => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });
  const proWorld = () => {
    service = fakeSupabase((c) => {
      if (c.table === 'orders') return { data: { id: ORDER_ID, status: 'Pendiente', tenant_id: 't-pro' } };
      if (c.table === 'tenants') return { data: PRO_TENANT };
      if (c.table === 'push_subscriptions' && c.head) return { count: 0 };
    });
  };

  it('sin llaves VAPID → 503', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect((await call({ orderId: ORDER_ID, subscription: sub() })).status).toBe(503);
  });
  it('endpoint que no es un servicio push real (SSRF) → 400', async () => {
    proWorld();
    expect((await call({ orderId: ORDER_ID, subscription: sub('http://169.254.169.254/x') })).status).toBe(400);
    expect(service.calls.some(c => c.op === 'upsert')).toBe(false);
  });
  it('local sin plan Pro → 403', async () => {
    service = fakeSupabase((c) => {
      if (c.table === 'orders') return { data: { id: ORDER_ID, status: 'Pendiente', tenant_id: 't-free' } };
      if (c.table === 'tenants') return { data: FREE_TENANT };
    });
    expect((await call({ orderId: ORDER_ID, subscription: sub() })).status).toBe(403);
  });
  it('pedido ya listo → 409', async () => {
    service = fakeSupabase((c) => {
      if (c.table === 'orders') return { data: { id: ORDER_ID, status: 'Listo', tenant_id: 't-pro' } };
    });
    expect((await call({ orderId: ORDER_ID, subscription: sub() })).status).toBe(409);
  });
  it('pedido de un local Pro → registra la suscripción', async () => {
    proWorld();
    const res = await call({ orderId: ORDER_ID, subscription: sub() });
    expect(res.status).toBe(200);
    const up = service.calls.find(c => c.op === 'upsert');
    expect(up?.payload).toMatchObject({ order_id: ORDER_ID, endpoint: 'https://fcm.googleapis.com/fcm/send/xyz' });
  });
  it('limita los intentos por IP (429)', async () => {
    proWorld();
    const headers = { 'x-forwarded-for': '9.9.9.9' };
    let last = 200;
    for (let i = 0; i < 12; i++) {
      last = (await POST(new NextRequest('http://localhost/api/push/subscribe', {
        method: 'POST', headers, body: JSON.stringify({ orderId: ORDER_ID, subscription: sub() }),
      }))).status;
    }
    expect(last).toBe(429);
  });
});

// ── WhatsApp webhook ─────────────────────────────────────────────────────────
describe('WhatsApp webhook', async () => {
  const { GET, POST } = await import('@/app/api/whatsapp/webhook/route');
  const signed = (obj: object, secret = 'appsecret') => {
    const raw = JSON.stringify(obj);
    return new NextRequest('http://localhost/api/whatsapp/webhook', {
      method: 'POST',
      headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex') },
      body: raw,
    });
  };
  const incoming = (text: string) => ({
    entry: [{ changes: [{ value: { messages: [{ from: '56988887777', type: 'text', text: { body: text } }] } }] }],
  });

  it('GET: handshake con el token correcto', async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'verif';
    const ok = await GET(new NextRequest('http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verif&hub.challenge=777'));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('777');
    const bad = await GET(new NextRequest('http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=777'));
    expect(bad.status).toBe(403);
  });
  it('POST con firma inválida → 401 y no toca la base', async () => {
    const res = await POST(signed(incoming('Ref: HA-ABCD2345'), 'otro-secreto'));
    expect(res.status).toBe(401);
    expect(service.calls).toHaveLength(0);
  });
  it('POST válido con código → vincula el teléfono y confirma al cliente', async () => {
    service = fakeSupabase((c) => {
      if (c.table === 'whatsapp_links' && c.op === 'select') {
        return { data: { id: 'l1', order_id: ORDER_ID, notified_at: null, created_at: new Date().toISOString() } };
      }
      if (c.table === 'orders') return { data: { short_id: 5, tenant_id: 't-pro' } };
      if (c.table === 'tenants') return { data: { name: 'Mi Truck' } };
    });
    sendWhatsAppText.mockResolvedValue(true);
    const res = await POST(signed(incoming('Hola 👋 Avísame cuando mi pedido esté listo. Ref: HA-ABCD2345')));
    expect(res.status).toBe(200);
    const link = service.calls.find(c => c.table === 'whatsapp_links' && c.op === 'update');
    expect(link?.payload.wa_id).toBe('56988887777');
    expect(sendWhatsAppText).toHaveBeenCalledWith('56988887777', expect.stringContaining('#5'));
  });
  it('código ya usado → se ignora', async () => {
    service = fakeSupabase((c) => {
      if (c.table === 'whatsapp_links') return { data: { id: 'l1', order_id: ORDER_ID, notified_at: new Date().toISOString(), created_at: new Date().toISOString() } };
    });
    await POST(signed(incoming('Ref: HA-ABCD2345')));
    expect(service.calls.some(c => c.op === 'update')).toBe(false);
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fake chainable Supabase client that records the updates it receives
const state = { currentPaymentId: null as string | null, updates: [] as any[] };
vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { subscription_payment_id: state.currentPaymentId, name: 'Truck', owner_id: 'o1' },
            error: null,
          }),
        }),
      }),
      update: (payload: any) => ({
        eq: async () => {
          state.updates.push(payload);
          return { error: null };
        },
      }),
    }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'dueno@correo.cl' } } }) } },
  }),
}));
vi.mock('@/lib/email', () => ({ sendWelcomeEmail: vi.fn() }));

const { activateTenant } = await import('@/lib/billing');

beforeEach(() => {
  state.currentPaymentId = null;
  state.updates = [];
});

describe('activateTenant', () => {
  it('anual: activa y fija vencimiento a 12 meses desde la fecha de pago', async () => {
    await activateTenant('t1', 'pro', 'pay-1', { annual: true, paidAt: new Date('2026-03-15T12:00:00Z') });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ subscription_status: 'active', plan_id: 'pro', subscription_payment_id: 'pay-1' });
    expect(new Date(state.updates[0].subscription_expires_at).toISOString().slice(0, 10)).toBe('2027-03-15');
  });

  it('anual: el mismo pago no se aplica dos veces (no reactiva un negocio cancelado)', async () => {
    state.currentPaymentId = 'pay-1';
    await activateTenant('t1', 'pro', 'pay-1', { annual: true });
    expect(state.updates).toHaveLength(0);
  });

  it('mensual: sin vencimiento y permite reactivar con el mismo id de suscripción', async () => {
    state.currentPaymentId = 'pre-1';
    await activateTenant('t1', 'starter', 'pre-1', { annual: false });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].subscription_expires_at).toBeNull();
  });
});

import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { getEffectivePlan, isProPlan } from '@/lib/plans';
import { sendPushForOrder } from '@/lib/push';
import { sendWhatsAppText, WHATSAPP_WINDOW_MS } from '@/lib/whatsapp';

export const DEMO_TENANT_ID = 'a0000000-0000-0000-0000-000000000001';

/** "Order ready" alerts are a Pro feature (and work in the public demo so they can be shown). */
export function notificationsAllowed(tenant: {
  id: string;
  plan_id?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  subscription_expires_at?: string | null;
}): boolean {
  return tenant.id === DEMO_TENANT_ID || isProPlan(getEffectivePlan(tenant));
}

/**
 * Tells the customer their order is ready, through every channel they opted into:
 * web push and/or WhatsApp. Failures never throw — the kitchen flow must not depend on this.
 */
export async function notifyOrderReady(orderId: string): Promise<{ push: number; whatsapp: number }> {
  const result = { push: 0, whatsapp: 0 };
  try {
    const supabase = createServiceSupabaseClient();
    const { data: order } = await (supabase as any)
      .from('orders')
      .select('id, short_id, pickup_code, tenant_id')
      .eq('id', orderId)
      .single();
    if (!order) return result;

    const { data: tenant } = await (supabase as any)
      .from('tenants')
      .select('id, slug, name, plan_id, subscription_status, trial_ends_at, subscription_expires_at')
      .eq('id', order.tenant_id)
      .single();
    if (!tenant || !notificationsAllowed(tenant)) return result;

    const label = order.short_id ? `#${order.short_id}` : '';
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const trackUrl = `${appUrl}/m/${tenant.slug}/pedido/${order.id}?code=${order.pickup_code}`;

    const [push, wa] = await Promise.allSettled([
      sendPushForOrder(order.id, {
        title: '🔥 ¡Tu pedido está listo!',
        body: `Pedido ${label} en ${tenant.name}. Muestra tu código ${order.pickup_code} para retirarlo.`,
        url: `/m/${tenant.slug}/pedido/${order.id}?code=${order.pickup_code}`,
        tag: `order-${order.id}`,
      }),
      notifyByWhatsApp(order, tenant, trackUrl),
    ]);
    if (push.status === 'fulfilled') result.push = push.value;
    if (wa.status === 'fulfilled') result.whatsapp = wa.value;
  } catch (err: any) {
    console.warn('notifyOrderReady failed:', err?.message ?? err);
  }
  return result;
}

async function notifyByWhatsApp(
  order: { id: string; short_id: number | null; pickup_code: string },
  tenant: { name: string },
  trackUrl: string,
): Promise<number> {
  const supabase = createServiceSupabaseClient();
  const { data: links } = await (supabase as any)
    .from('whatsapp_links')
    .select('id, wa_id, linked_at')
    .eq('order_id', order.id)
    .is('notified_at', null)
    .not('wa_id', 'is', null);

  let sent = 0;
  for (const link of links ?? []) {
    // Outside the 24h window a free-form message is rejected (and templates are billed): skip
    if (!link.linked_at || Date.now() - new Date(link.linked_at).getTime() > WHATSAPP_WINDOW_MS) continue;

    const ok = await sendWhatsAppText(
      link.wa_id,
      `🔥 ¡Tu pedido ${order.short_id ? '#' + order.short_id : ''} en ${tenant.name} está listo!\n` +
      `Código de retiro: *${order.pickup_code}*\n${trackUrl}`,
    );
    if (ok) {
      sent++;
      // Privacy: drop the phone number as soon as it has served its purpose
      await (supabase as any)
        .from('whatsapp_links')
        .update({ notified_at: new Date().toISOString(), wa_id: null })
        .eq('id', link.id);
    }
  }
  return sent;
}

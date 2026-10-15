import webpush from 'web-push';
import { createServiceSupabaseClient } from '@/lib/supabase/server';

/**
 * Web Push ("tu pedido está listo" on the customer's phone). Free and unlimited:
 * messages go through the browser vendor's push service, nothing is billed per message.
 *
 * Needs VAPID keys:  npx web-push generate-vapid-keys
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@domain)
 */

// The server POSTs to the endpoint the browser hands us. To avoid being used as an
// SSRF proxy we only accept the real push services of the major browsers.
const ALLOWED_PUSH_HOSTS: RegExp[] = [
  /^fcm\.googleapis\.com$/,                    // Chrome / Android / Edge (new)
  /^updates\.push\.services\.mozilla\.com$/,    // Firefox
  /^[a-z0-9.-]+\.push\.apple\.com$/,           // Safari / iOS (web.push.apple.com)
  /^[a-z0-9.-]+\.notify\.windows\.com$/,       // Edge legacy / WNS
];

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.username && !u.password && ALLOWED_PUSH_HOSTS.some(r => r.test(u.hostname));
  } catch {
    return false;
  }
}

export function isPushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidReady = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/**
 * Sends the payload to every subscription of an order, then deletes them (the alert is
 * one-shot). Dead subscriptions (404/410) are cleaned up too. Returns how many were delivered.
 */
export async function sendPushForOrder(orderId: string, payload: PushPayload): Promise<number> {
  if (!isPushConfigured()) return 0;
  ensureVapid();

  const supabase = createServiceSupabaseClient();
  const { data: subs, error } = await (supabase as any)
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('order_id', orderId);
  if (error || !subs?.length) return 0;

  let delivered = 0;
  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 },
      );
      delivered++;
    } catch (err: any) {
      if (err?.statusCode !== 404 && err?.statusCode !== 410) {
        console.warn('Push send failed:', err?.statusCode ?? err?.message);
      }
    }
  }));

  await (supabase as any).from('push_subscriptions').delete().eq('order_id', orderId);
  return delivered;
}

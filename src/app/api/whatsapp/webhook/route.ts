import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { extractLinkToken, sendWhatsAppText, verifyWhatsAppSignature } from '@/lib/whatsapp';

/**
 * GET  → Meta's webhook verification handshake (hub.challenge).
 * POST → incoming WhatsApp messages. When a customer sends the "HA-XXXXXXXX" code we
 *        link their number to that order, so the kitchen's "Listo" can reach them for free
 *        (inside the 24h window their message just opened).
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === expected) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWhatsAppSignature(raw, request.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const body = JSON.parse(raw);
    const service = createServiceSupabaseClient();

    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        for (const msg of change?.value?.messages ?? []) {
          const token = msg?.type === 'text' ? extractLinkToken(msg.text?.body) : null;
          if (!token || !msg.from) continue;

          const { data: link } = await (service as any)
            .from('whatsapp_links')
            .select('id, order_id, notified_at, created_at')
            .eq('token', token)
            .single();
          // Codes are valid for 48 h and for a single notification
          if (!link || link.notified_at || Date.now() - new Date(link.created_at).getTime() > 48 * 3600 * 1000) continue;

          await (service as any)
            .from('whatsapp_links')
            .update({ wa_id: String(msg.from), linked_at: new Date().toISOString() })
            .eq('id', link.id);

          const { data: order } = await (service as any)
            .from('orders').select('short_id, tenant_id').eq('id', link.order_id).single();
          const { data: tenant } = order
            ? await (service as any).from('tenants').select('name').eq('id', order.tenant_id).single()
            : { data: null };

          await sendWhatsAppText(
            String(msg.from),
            `¡Listo! Te avisaremos por aquí apenas tu pedido ${order?.short_id ? '#' + order.short_id : ''}` +
            `${tenant?.name ? ' en ' + tenant.name : ''} esté listo 🍌`,
          );
        }
      }
    }
  } catch (err: any) {
    // Always 200 once the signature is valid: Meta retries aggressively on errors
    console.error('whatsapp webhook error:', err?.message ?? err);
  }
  return NextResponse.json({ received: true });
}

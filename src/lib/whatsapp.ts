import { createHmac, randomInt, timingSafeEqual } from 'crypto';

/**
 * WhatsApp "tu pedido está listo" through the WhatsApp Business Cloud API, designed so
 * it costs nothing per message:
 *
 *  1. On the tracking page the customer taps "Avísame por WhatsApp". That opens a chat
 *     with OUR number with a prefilled text containing a one-time code (HA-XXXXXXXX).
 *  2. Their message opens a 24-hour customer-service window. Inside that window Meta
 *     does not charge for free-form messages
 *     (https://developers.facebook.com/docs/whatsapp/pricing).
 *  3. When the kitchen marks the order "Listo" we reply in that window.
 *
 * We never send business-initiated templates (those are billed per message).
 *
 * Env: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET,
 *      WHATSAPP_VERIFY_TOKEN, NEXT_PUBLIC_WHATSAPP_NUMBER (digits only, with country code),
 *      WHATSAPP_API_VERSION (optional, default v21.0).
 */

export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWhatsAppConfigured(): boolean {
  return !!(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_APP_SECRET &&
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
  );
}

// No 0/O/1/I/L to avoid transcription mistakes
const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newLinkToken(): string {
  let t = '';
  for (let i = 0; i < 8; i++) t += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  return t;
}

const TOKEN_RE = /\bHA-([A-Z0-9]{8})\b/i;

/** Pulls the link code out of an incoming message ("... Ref: HA-ABCD2345"). */
export function extractLinkToken(text: string | undefined | null): string | null {
  const m = (text ?? '').match(TOKEN_RE);
  return m ? m[1].toUpperCase() : null;
}

/** Validates Meta's `X-Hub-Signature-256` header against the raw request body. */
export function verifyWhatsAppSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
  const received = Buffer.from(header.slice('sha256='.length));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function buildWhatsAppLink(token: string): string {
  const number = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');
  const text = `Hola 👋 Avísame cuando mi pedido esté listo. Ref: HA-${token}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** Sends a free-form text. Only works inside an open 24h window; returns false otherwise. */
export async function sendWhatsAppText(to: string, body: string): Promise<boolean> {
  if (!isWhatsAppConfigured()) return false;
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body, preview_url: false },
      }),
    });
    if (!res.ok) {
      console.warn('WhatsApp send failed:', res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('WhatsApp send error:', err?.message);
    return false;
  }
}

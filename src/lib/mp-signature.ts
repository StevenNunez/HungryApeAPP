import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Mercado Pago webhook signature check.
 * https://www.mercadopago.cl/developers/es/docs/your-integrations/notifications/webhooks
 * manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" signed with HMAC-SHA256.
 *
 *   'valid'   → header present and matches
 *   'invalid' → header present but does NOT match  → reject (401)
 *   'absent'  → no secret configured or no x-signature header (IPN via notification_url
 *               does not always carry one). Accepted: handlers never trust the body, they
 *               re-fetch the payment / subscription from Mercado Pago with our own token.
 */
export type SignatureResult = 'valid' | 'invalid' | 'absent';

export function verifyMercadoPagoSignature(
  request: NextRequest,
  bodyDataId: string,
  secret: string | undefined = process.env.MERCADOPAGO_WEBHOOK_SECRET,
): SignatureResult {
  if (!secret) return 'absent';

  const xSignature = request.headers.get('x-signature');
  if (!xSignature) return 'absent';

  const parts: Record<string, string> = {};
  for (const part of xSignature.split(',')) {
    const [k, v] = part.split('=');
    if (k && v) parts[k.trim()] = v.trim();
  }
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return 'invalid';

  // data.id comes from the query string (lowercased when alphanumeric); fall back to the body
  let dataId = request.nextUrl.searchParams.get('data.id') ?? bodyDataId;
  if (/^[a-zA-Z0-9]+$/.test(dataId)) dataId = dataId.toLowerCase();

  const requestId = request.headers.get('x-request-id');
  let manifest = '';
  if (dataId) manifest += `id:${dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const expected = Buffer.from(createHmac('sha256', secret).update(manifest).digest('hex'));
  const received = Buffer.from(v1);
  return expected.length === received.length && timingSafeEqual(expected, received) ? 'valid' : 'invalid';
}

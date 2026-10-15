import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Secrets at rest (sellers' Mercado Pago tokens) are stored AES-256-GCM encrypted with a key
 * that lives only in the server environment: PAYMENTS_ENC_KEY = 64 hex chars (32 bytes).
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
function getKey(): Buffer {
  const hex = process.env.PAYMENTS_ENC_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('PAYMENTS_ENC_KEY must be 64 hex characters');
  }
  return Buffer.from(hex, 'hex');
}

export function isEncryptionConfigured(): boolean {
  return /^[0-9a-fA-F]{64}$/.test(process.env.PAYMENTS_ENC_KEY ?? '');
}

const b64 = (b: Buffer) => b.toString('base64url');

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${b64(iv)}.${b64(cipher.getAuthTag())}.${b64(data)}`;
}

export function decryptSecret(token: string): string {
  const [version, iv, tag, data] = token.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Invalid encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

// ─── Signed, expiring OAuth "state" (CSRF protection for the connect flow) ───

export function signState(payload: { tenantId: string }, ttlMs = 10 * 60 * 1000): string {
  const body = b64(Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs, n: b64(randomBytes(8)) })));
  const sig = b64(createHmac('sha256', getKey()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyState(state: string | null): { tenantId: string } | null {
  if (!state) return null;
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', getKey()).update(body).digest();
  const received = Buffer.from(sig, 'base64url');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof parsed.tenantId !== 'string' || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return { tenantId: parsed.tenantId };
  } catch {
    return null;
  }
}

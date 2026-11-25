import { createHash, randomBytes } from 'node:crypto';

/** Invitation link token: random, URL-safe. Only its hash is stored. */
export function newInvitationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const INVITATION_DAYS = 7;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

/**
 * Base URL for links sent by email: the domain the request came from (so an
 * invitation sent from localhost points to localhost — fine while testing).
 */
export function originOf(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

export type InvitationState = 'valid' | 'expired' | 'used' | 'revoked' | 'missing';

export function invitationState(inv: { expires_at: string; accepted_at: string | null; revoked_at: string | null } | null, now = new Date()): InvitationState {
  if (!inv) return 'missing';
  if (inv.revoked_at) return 'revoked';
  if (inv.accepted_at) return 'used';
  if (new Date(inv.expires_at).getTime() <= now.getTime()) return 'expired';
  return 'valid';
}

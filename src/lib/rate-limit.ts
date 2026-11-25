/**
 * Minimal in-memory sliding-window rate limiter.
 * Per server instance (Fluid Compute reuses instances, so it is effective against
 * casual abuse; it is not a distributed limiter).
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter(t => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  // Opportunistic cleanup so the map cannot grow without bound
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every(t => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return true;
}

/** Best-effort client IP behind Vercel / proxies. */
export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown';
}

/**
 * Same as rateLimit, but counted in the database (migration 022) so every server
 * instance shares the count. Falls back to the in-memory limiter if the database
 * call fails or the migration isn't applied: it never blocks requests because of that.
 * Server-only (uses the service role).
 */
export async function rateLimitShared(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return rateLimit(key, limit, windowMs);
    const { createServiceSupabaseClient } = await import('@/lib/supabase/server');
    const { data, error } = await (createServiceSupabaseClient() as any).rpc('hit_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.round(windowMs / 1000)),
    });
    if (error || typeof data !== 'boolean') return rateLimit(key, limit, windowMs);
    return data;
  } catch {
    return rateLimit(key, limit, windowMs);
  }
}

'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { loadMembership, type TenantRole } from '@/lib/roles';

export const NO_TENANT_MESSAGE = 'Tu cuenta no tiene un negocio configurado. Por favor, completa tu registro.';

export type TenantStatus = 'loading' | 'found' | 'creating' | 'not_found' | 'unauthenticated' | 'blocked';

export const STAFF_BLOCKED_MESSAGE = 'El plan del local ya no incluye equipo, así que tu acceso está en pausa. Vuelve a estar disponible apenas el dueño active el Plan Enterprise.';

export interface UseTenantResult {
  tenant: any | null;
  status: TenantStatus;
  error: string | null;
  /** Email of the signed-in person (for the panel header). */
  userEmail: string | null;
  /** Role of the signed-in person in this business (dueno · encargado · cocina). */
  role: TenantRole | null;
  /** Reloads the business from the database (after saving settings, a payment, etc.). */
  refetch: () => void;
  /** Replaces the business in memory after a local save, without a round trip. */
  setTenant: (tenant: any) => void;
}

const TenantContext = createContext<UseTenantResult | null>(null);

interface TenantProviderProps {
  children: ReactNode;
  /** Read on the server by dashboard/layout.tsx: the panel paints with it, no spinner. */
  initialTenant: any | null;
  initialRole: TenantRole | null;
  initialUserEmail: string | null;
  /** Staff of a business whose plan doesn't include a team. */
  initialBlocked?: boolean;
  /** False when the server had no session (the middleware normally redirects first). */
  signedIn: boolean;
  /** The server read failed (network): start loading and retry from the browser. */
  retryOnClient?: boolean;
}

/**
 * The business of the signed-in owner, read ONCE per visit to the panel (on the
 * server, in the layout) and shared by every dashboard page through context.
 * Before, each page re-did user → business → data one after another, with a
 * full-screen spinner every time.
 */
export function TenantProvider({ children, initialTenant, initialRole, initialUserEmail, signedIn, retryOnClient = false, initialBlocked = false }: TenantProviderProps) {
  const [tenant, setTenantState] = useState<any | null>(initialTenant);
  const [role, setRole] = useState<TenantRole | null>(initialRole);
  const [userEmail, setUserEmail] = useState<string | null>(initialUserEmail);
  const [status, setStatus] = useState<TenantStatus>(
    retryOnClient ? 'loading' : initialBlocked ? 'blocked' : initialTenant ? 'found' : signedIn ? 'not_found' : 'unauthenticated',
  );
  const [error, setError] = useState<string | null>(
    initialBlocked ? STAFF_BLOCKED_MESSAGE : initialTenant ? null : signedIn ? NO_TENANT_MESSAGE : 'No has iniciado sesión.',
  );
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setTenantState(null);
        setStatus('unauthenticated');
        setError('No has iniciado sesión.');
        return;
      }
      setUserEmail(user.email ?? null);
      let membership;
      try {
        membership = await loadMembership(supabase, user.id);
      } catch {
        setStatus('not_found');
        setError('No pudimos cargar tu negocio. Revisa tu conexión y recarga la página.');
        return;
      }
      if (!membership) {
        setTenantState(null);
        setRole(null);
        setStatus('not_found');
        setError(NO_TENANT_MESSAGE);
        return;
      }
      setRole(membership.role);
      if (membership.blocked) {
        setTenantState(null);
        setStatus('blocked');
        setError(STAFF_BLOCKED_MESSAGE);
        return;
      }
      setTenantState(membership.tenant);
      setStatus('found');
      setError(null);
    } catch {
      setStatus('not_found');
      setError('No pudimos cargar tu negocio. Revisa tu conexión y recarga la página.');
    } finally {
      loadingRef.current = false;
    }
  }, []);

  // Paid before signing up? Apply that payment to this business. The webhook can land
  // a few seconds after the first load, so retry at most once a minute (in background).
  const tenantId = tenant?.id as string | undefined;
  const subscriptionStatus = tenant?.subscription_status as string | undefined;
  useEffect(() => {
    // Billing belongs to the owner: staff never trigger the claim
    if (!tenantId || subscriptionStatus === 'active' || role !== 'dueno') return;
    const flag = `ha_claim_${tenantId}`;
    try {
      if (Date.now() - Number(sessionStorage.getItem(flag) || 0) < 60_000) return;
    } catch { /* private mode: try anyway */ }
    (async () => {
      try {
        const res = await fetch('/api/billing/claim', { method: 'POST' });
        const json = await res.json().catch(() => null);
        if (json && json.reason !== 'email_not_confirmed') {
          try { sessionStorage.setItem(flag, String(Date.now())); } catch { /* ignore */ }
        }
        if (json?.claimed) await load();
      } catch { /* non-fatal: the next visit retries */ }
    })();
  }, [tenantId, subscriptionStatus, role, load]);

  useEffect(() => {
    if (retryOnClient) void load();
  }, [retryOnClient, load]);

  const setTenant = useCallback((t: any) => {
    setTenantState(t);
    if (t) { setStatus('found'); setError(null); }
  }, []);

  const value = useMemo<UseTenantResult>(
    () => ({ tenant, status, error, userEmail, role, refetch: () => { void load(); }, setTenant }),
    [tenant, status, error, userEmail, role, load, setTenant],
  );

  return createElement(TenantContext.Provider, { value }, children);
}

/**
 * The signed-in owner's business. Inside /dashboard it comes from TenantProvider
 * (already loaded on the server). The fallback below only runs if a component
 * using it is ever rendered outside the provider.
 */
export function useTenant(): UseTenantResult {
  const ctx = useContext(TenantContext);
  const fallback = useStandaloneTenant(!ctx);
  return ctx ?? fallback;
}

function useStandaloneTenant(enabled: boolean): UseTenantResult {
  const [tenant, setTenant] = useState<any | null>(null);
  const [status, setStatus] = useState<TenantStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { setStatus('unauthenticated'); setError('No has iniciado sesión.'); return; }
      setUserEmail(user.email ?? null);
      let m;
      try { m = await loadMembership(supabase, user.id); } catch { m = undefined; }
      if (cancelled) return;
      if (!m) { setStatus('not_found'); setError(m === undefined ? 'No pudimos cargar tu negocio.' : NO_TENANT_MESSAGE); return; }
      setTenant(m.tenant); setRole(m.role); setStatus('found'); setError(null);
    })();
    return () => { cancelled = true; };
  }, [enabled, version]);

  return { tenant, status, error, userEmail, role, refetch: () => setVersion(v => v + 1), setTenant };
}

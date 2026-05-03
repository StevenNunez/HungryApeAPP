'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export type TenantStatus = 'loading' | 'found' | 'creating' | 'not_found' | 'unauthenticated';

export interface UseTenantResult {
  tenant: any | null;
  status: TenantStatus;
  error: string | null;
  refetch: () => void;
}

/**
 * useTenant - Hook centralizado para cargar el tenant del usuario autenticado.
 * - Si el usuario no está logueado: status = 'unauthenticated'
 * - Si existe el tenant: status = 'found'
 * - Si no existe el tenant: status = 'not_found' con error descriptivo
 * - Nunca queda cargando indefinidamente (timeout de 8s)
 */
export function useTenant(): UseTenantResult {
  const [tenant, setTenant] = useState<any | null>(null);
  const [status, setStatus] = useState<TenantStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // Permite refetch()

  const refetch = () => setVersion(v => v + 1);

  useEffect(() => {
    let cancelled = false;

    // Safety timeout — never spin forever
    const timeout = setTimeout(() => {
      if (!cancelled && status === 'loading') {
        setStatus('not_found');
        setError('Tiempo de espera agotado. Verifica tu conexión.');
      }
    }, 8000);

    async function load() {
      try {
        const supabase = createClient();

        // 1. Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
          if (!cancelled) {
            setStatus('unauthenticated');
            setError('No has iniciado sesión.');
          }
          clearTimeout(timeout);
          return;
        }

        // 2. Query tenant
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .select('*')
          .eq('owner_id', user.id)
          .maybeSingle(); // maybeSingle() returns null instead of error when no row found

        if (tenantError) {
          if (!cancelled) {
            setStatus('not_found');
            setError(`Error al cargar el negocio: ${tenantError.message}`);
          }
          clearTimeout(timeout);
          return;
        }

        if (!tenantData) {
          // Tenant doesn't exist — surface this clearly
          if (!cancelled) {
            setStatus('not_found');
            setError('Tu cuenta no tiene un negocio configurado. Por favor, completa tu registro.');
          }
          clearTimeout(timeout);
          return;
        }

        // 3. All good
        if (!cancelled) {
          setTenant(tenantData);
          setStatus('found');
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setStatus('not_found');
          setError(err.message || 'Error inesperado.');
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    setStatus('loading');
    setTenant(null);
    setError(null);
    load();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [version]);

  return { tenant, status, error, refetch };
}

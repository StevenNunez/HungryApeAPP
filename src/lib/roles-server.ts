import { isTenantRole, staffBlocked, type TenantRole } from '@/lib/roles';

/**
 * Role of a user in a given business, read with the SERVICE client (server routes
 * only, after authenticating the user). Falls back to ownership when the
 * tenant_members table doesn't exist yet (migration 019 not applied).
 */
export async function roleInTenant(service: any, tenantId: string, userId: string): Promise<TenantRole | null> {
  const { data, error } = await service
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!error && isTenantRole(data?.role)) {
    if (data.role === 'dueno') return 'dueno';
    const { data: tenant } = await service
      .from('tenants').select('plan_id, subscription_status, trial_ends_at, subscription_expires_at').eq('id', tenantId).maybeSingle();
    return staffBlocked(data.role, tenant) ? null : data.role;
  }

  const { data: tenant } = await service.from('tenants').select('owner_id').eq('id', tenantId).maybeSingle();
  return tenant?.owner_id === userId ? 'dueno' : null;
}

/** The business a user belongs to (any role), for routes that only know the user. */
export async function tenantOfUser(service: any, userId: string): Promise<{ tenantId: string; role: TenantRole } | null> {
  const { data, error } = await service
    .from('tenant_members')
    .select('tenant_id, role')
    .eq('user_id', userId)
    .maybeSingle();
  if (!error && data && isTenantRole(data.role)) return { tenantId: data.tenant_id, role: data.role };

  const { data: tenant } = await service.from('tenants').select('id').eq('owner_id', userId).maybeSingle();
  return tenant ? { tenantId: tenant.id, role: 'dueno' } : null;
}

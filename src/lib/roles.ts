/**
 * Team roles (migration 019). One account belongs to one business, with a role:
 *   dueno     → everything (billing, settings, team). It is tenants.owner_id.
 *   encargado → menu, kitchen, cash register, reports, QR. No billing, settings or team.
 *   cocina    → kitchen only.
 * The database enforces the same rules (RLS with member_tenants()); this file only
 * decides what each screen shows.
 */

import { canUseTeam, getEffectivePlan } from '@/lib/plans';

export type TenantRole = 'dueno' | 'encargado' | 'cocina';

export const ROLE_LABEL: Record<TenantRole, string> = {
  dueno: 'Dueño',
  encargado: 'Encargado',
  cocina: 'Cocina',
};

export const ROLE_DESCRIPTION: Record<Exclude<TenantRole, 'dueno'>, string> = {
  encargado: 'Menú, cocina, caja, reportes y QR. No ve la facturación ni el equipo.',
  cocina: 'Solo la cocina: ve los pedidos y los mueve de estado.',
};

export type PanelArea = 'inicio' | 'cocina' | 'menu' | 'caja' | 'reportes' | 'insumos' | 'qr' | 'configuracion' | 'equipo' | 'facturacion';

const ACCESS: Record<PanelArea, TenantRole[]> = {
  inicio: ['dueno', 'encargado', 'cocina'],
  cocina: ['dueno', 'encargado', 'cocina'],
  menu: ['dueno', 'encargado'],
  caja: ['dueno', 'encargado'],
  reportes: ['dueno', 'encargado'],
  insumos: ['dueno', 'encargado'],
  qr: ['dueno', 'encargado'],
  configuracion: ['dueno'],
  equipo: ['dueno'],
  facturacion: ['dueno'],
};

export function canAccess(role: TenantRole | null | undefined, area: PanelArea): boolean {
  return !!role && ACCESS[area].includes(role);
}

export function isTenantRole(v: unknown): v is TenantRole {
  return v === 'dueno' || v === 'encargado' || v === 'cocina';
}

export interface Membership {
  tenant: any;
  role: TenantRole;
  /** Staff of a business whose plan no longer includes a team (Enterprise): no panel access. */
  blocked?: boolean;
}


/** Staff (not the owner) can only use the panel while the business has Enterprise. */
export function staffBlocked(role: TenantRole, tenant: any | null): boolean {
  if (role === 'dueno') return false;
  return !tenant || !canUseTeam(getEffectivePlan(tenant));
}

/**
 * The business and role of a signed-in user. Works with the browser or server
 * Supabase client (RLS applies). Falls back to "owner of a business" when the
 * tenant_members table doesn't exist yet (migration 019 not applied).
 * Returns null when the user has no business; throws on network/DB errors.
 */
export async function loadMembership(supabase: any, userId: string): Promise<Membership | null> {
  const { data, error } = await supabase
    .from('tenant_members')
    .select('role, tenants(*)')
    .eq('user_id', userId)
    .maybeSingle();

  if (!error) {
    if (data && isTenantRole(data.role) && data.role !== 'dueno') {
      // With migration 020 the database hides the business from staff when the plan
      // dropped (tenants comes back null); before it, the plan is checked here.
      return { tenant: data.tenants ?? null, role: data.role, blocked: staffBlocked(data.role, data.tenants) };
    }
    if (data?.tenants && isTenantRole(data.role)) return { tenant: data.tenants, role: data.role };
    // No membership row: maybe an owner created before 019 ran (the backfill covers
    // that), or a business created while the trigger didn't exist → check ownership.
  } else if (!/tenant_members|PGRST205|42P01|schema cache/i.test(`${error.code} ${error.message}`)) {
    throw new Error(error.message);
  }

  const { data: owned, error: ownedError } = await supabase
    .from('tenants').select('*').eq('owner_id', userId).maybeSingle();
  if (ownedError) throw new Error(ownedError.message);
  return owned ? { tenant: owned, role: 'dueno' } : null;
}

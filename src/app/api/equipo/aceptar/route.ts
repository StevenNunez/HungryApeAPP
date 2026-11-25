import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase/server';
import { hashInvitationToken, invitationState } from '@/lib/equipo';
import { tenantOfUser } from '@/lib/roles-server';
import { anotarError } from '@/lib/errores-servidor';
import { rateLimitShared, clientIp } from '@/lib/rate-limit';
import { canUseTeam, getEffectivePlan } from '@/lib/plans';

/**
 * POST /api/equipo/aceptar   { token }
 * The invited person (signed in with the SAME email the invitation was sent to)
 * joins the business with the invited role.
 */
export async function POST(request: NextRequest) {
  if (!(await rateLimitShared(`equipo-aceptar:${clientIp(request.headers)}`, 20, 10 * 60 * 1000))) {
    return NextResponse.json({ error: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para aceptar la invitación.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token : '';
  if (token.length < 20 || token.length > 100) {
    return NextResponse.json({ error: 'El enlace de invitación no es válido.' }, { status: 400 });
  }

  const service = createServiceSupabaseClient() as any;
  const { data: inv } = await service
    .from('tenant_invitations')
    .select('id, tenant_id, email, role, expires_at, accepted_at, revoked_at')
    .eq('token_hash', hashInvitationToken(token))
    .maybeSingle();

  const state = invitationState(inv);
  if (state !== 'valid') {
    const msg = {
      missing: 'El enlace de invitación no es válido.',
      expired: 'Esta invitación venció. Pídele al dueño del local que te envíe una nueva.',
      used: 'Esta invitación ya se usó.',
      revoked: 'Esta invitación fue anulada por el local.',
    }[state];
    return NextResponse.json({ error: msg }, { status: 410 });
  }

  const { data: tenantPlan } = await service
    .from('tenants').select('plan_id, subscription_status, trial_ends_at, subscription_expires_at').eq('id', inv.tenant_id).single();
  if (!canUseTeam(getEffectivePlan(tenantPlan ?? {}))) {
    return NextResponse.json(
      { error: 'El plan de este local ya no incluye equipo. Pídele al dueño que active el Plan Enterprise.' },
      { status: 402 },
    );
  }

  if ((user.email ?? '').toLowerCase() !== inv.email) {
    return NextResponse.json(
      { error: `Esta invitación es para ${inv.email}. Entra con ese correo para aceptarla.` },
      { status: 403 },
    );
  }

  const current = await tenantOfUser(service, user.id);
  if (current && current.tenantId !== inv.tenant_id) {
    return NextResponse.json(
      { error: 'Tu cuenta ya pertenece a otro local. Por ahora cada cuenta puede estar en un solo local: usa otro correo.' },
      { status: 409 },
    );
  }

  if (!current) {
    const { error } = await service
      .from('tenant_members')
      .insert({ tenant_id: inv.tenant_id, user_id: user.id, role: inv.role });
    if (error) {
      await anotarError({ origen: 'servidor', donde: 'api/equipo/aceptar', error, tenantId: inv.tenant_id, usuarioId: user.id });
      return NextResponse.json({ error: 'No pudimos sumarte al equipo. Inténtalo de nuevo.' }, { status: 500 });
    }
  }

  await service
    .from('tenant_invitations')
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq('id', inv.id);

  return NextResponse.json({ ok: true, role: current?.role ?? inv.role });
}

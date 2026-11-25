import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase/server';
import { tenantOfUser } from '@/lib/roles-server';
import { newInvitationToken, normalizeEmail, originOf, INVITATION_DAYS } from '@/lib/equipo';
import { sendInvitationEmail } from '@/lib/invitation-email';
import { smtpConfigured } from '@/lib/email';
import { anotarError } from '@/lib/errores-servidor';
import { rateLimitShared } from '@/lib/rate-limit';
import { canUseTeam, getEffectivePlan } from '@/lib/plans';

/**
 * /api/equipo — the owner manages the team of their business.
 *   GET     members + pending invitations
 *   POST    { email, role }                   invite (emails a private link, valid 7 days)
 *   DELETE  { memberUserId } | { invitationId } remove a member / revoke an invitation
 * Only the owner ('dueno'). Writes use the service client after that check.
 */

async function requireOwner() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Inicia sesión de nuevo.' }, { status: 401 }) };
  const service = createServiceSupabaseClient() as any;
  const membership = await tenantOfUser(service, user.id);
  if (!membership || membership.role !== 'dueno') {
    return { error: NextResponse.json({ error: 'Solo el dueño del local puede administrar el equipo.' }, { status: 403 }) };
  }
  const { data: tenant } = await service
    .from('tenants').select('plan_id, subscription_status, trial_ends_at, subscription_expires_at').eq('id', membership.tenantId).single();
  return { user, service, tenantId: membership.tenantId, teamAvailable: canUseTeam(getEffectivePlan(tenant ?? {})) };
}

export async function GET() {
  const ctx = await requireOwner();
  if ('error' in ctx) return ctx.error;
  const { service, tenantId, user } = ctx;

  const [{ data: members, error: mErr }, { data: invites, error: iErr }] = await Promise.all([
    service.from('tenant_members').select('user_id, role, created_at').eq('tenant_id', tenantId).order('created_at'),
    service
      .from('tenant_invitations')
      .select('id, email, role, created_at, expires_at')
      .eq('tenant_id', tenantId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ]);
  if (mErr || iErr) {
    // Migration 019 not applied yet: say so instead of a generic failure (and don't log it as a bug)
    if (/PGRST205|42P01|schema cache/i.test(`${(mErr ?? iErr)?.code} ${(mErr ?? iErr)?.message}`)) {
      return NextResponse.json({ error: 'El equipo se activa con la próxima actualización de la base de datos (migración 019).' }, { status: 503 });
    }
    await anotarError({ origen: 'servidor', donde: 'api/equipo GET', error: mErr ?? iErr, tenantId, usuarioId: user.id });
    return NextResponse.json({ error: 'No pudimos cargar el equipo.' }, { status: 500 });
  }

  // Emails live in auth.users: a team is a handful of people, one lookup each is fine
  const withEmails = await Promise.all(
    (members ?? []).map(async (m: any) => {
      const { data } = await service.auth.admin.getUserById(m.user_id);
      return { userId: m.user_id, role: m.role, since: m.created_at, email: data?.user?.email ?? '—', isYou: m.user_id === user.id };
    }),
  );

  return NextResponse.json({
    teamAvailable: ctx.teamAvailable,
    members: withEmails,
    invitations: (invites ?? []).map((i: any) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expires_at })),
  });
}

export async function POST(request: NextRequest) {
  const ctx = await requireOwner();
  if ('error' in ctx) return ctx.error;
  const { service, tenantId, user } = ctx;

  if (!ctx.teamAvailable) {
    return NextResponse.json({ error: 'Invitar a tu equipo es parte del Plan Enterprise.' }, { status: 402 });
  }

  if (!(await rateLimitShared(`equipo-invitar:${user.id}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'Enviaste muchas invitaciones seguidas. Espera un rato.' }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  const role = body?.role === 'encargado' || body?.role === 'cocina' ? body.role : null;
  if (!email) return NextResponse.json({ error: 'Ese correo no parece válido.' }, { status: 400 });
  if (!role) return NextResponse.json({ error: 'Elige un rol: encargado o cocina.' }, { status: 400 });
  if (email === user.email?.toLowerCase()) {
    return NextResponse.json({ error: 'Ese es tu propio correo: ya eres el dueño.' }, { status: 400 });
  }

  // Already on this team?
  const { data: existing } = await service.from('tenant_members').select('user_id').eq('tenant_id', tenantId);
  for (const m of existing ?? []) {
    const { data } = await service.auth.admin.getUserById(m.user_id);
    if (data?.user?.email?.toLowerCase() === email) {
      return NextResponse.json({ error: 'Esa persona ya es parte del equipo.' }, { status: 409 });
    }
  }

  // A new invitation replaces any pending one for the same email
  await service
    .from('tenant_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null);

  const { token, hash } = newInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
  const { error: insErr } = await service.from('tenant_invitations').insert({
    tenant_id: tenantId,
    email,
    role,
    token_hash: hash,
    invited_by: user.id,
    expires_at: expiresAt.toISOString(),
  });
  if (insErr) {
    await anotarError({ origen: 'servidor', donde: 'api/equipo POST', error: insErr, tenantId, usuarioId: user.id });
    return NextResponse.json({ error: 'No pudimos crear la invitación.' }, { status: 500 });
  }

  const appUrl = originOf(request);
  const link = `${appUrl}/invitacion/${token}`;

  let emailed = false;
  if (smtpConfigured()) {
    const { data: tenant } = await service
      .from('tenants').select('name, logo_url, address, phone, slug').eq('id', tenantId).single();
    try {
      await sendInvitationEmail({ to: email, link, role, expiresAt, tenant, inviterEmail: user.email ?? null, appUrl });
      emailed = true;
    } catch (e) {
      await anotarError({ origen: 'servidor', donde: 'api/equipo POST (correo)', error: e, tenantId, usuarioId: user.id });
    }
  }

  // The link is also returned so the owner can share it by WhatsApp if the email doesn't arrive
  return NextResponse.json({ ok: true, emailed, link, expiresAt: expiresAt.toISOString() });
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireOwner();
  if ('error' in ctx) return ctx.error;
  const { service, tenantId, user } = ctx;
  const body = await request.json().catch(() => ({}));

  if (typeof body?.invitationId === 'string') {
    const { error } = await service
      .from('tenant_invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', body.invitationId)
      .eq('tenant_id', tenantId);
    if (error) return NextResponse.json({ error: 'No pudimos anular la invitación.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (typeof body?.memberUserId === 'string') {
    if (body.memberUserId === user.id) {
      return NextResponse.json({ error: 'No puedes quitarte a ti mismo: eres el dueño.' }, { status: 400 });
    }
    const { data: removed, error } = await service
      .from('tenant_members')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('user_id', body.memberUserId)
      .neq('role', 'dueno')
      .select('user_id');
    if (error) return NextResponse.json({ error: 'No pudimos quitar a esa persona.' }, { status: 500 });
    if (!removed?.length) return NextResponse.json({ error: 'Esa persona no está en tu equipo.' }, { status: 404 });
    // Access ends right away: every query checks membership (RLS), not the session
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Falta indicar a quién quitar.' }, { status: 400 });
}

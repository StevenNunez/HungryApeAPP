import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase/server';
import { hashInvitationToken, invitationState } from '@/lib/equipo';
import { ROLE_LABEL, ROLE_DESCRIPTION } from '@/lib/roles';
import { Logo } from '@/components/compartido/Logo';
import { TeoLabsCredit } from '@/components/compartido/TeoLabsCredit';
import { AcceptInvitation } from './AcceptInvitation';

export const metadata: Metadata = { title: 'Invitación al equipo', robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }> };

export default async function InvitationPage({ params }: Props) {
  const { token } = await params;
  const service = createServiceSupabaseClient() as any;
  const { data: inv } = token.length >= 20 && token.length <= 100
    ? await service
        .from('tenant_invitations')
        .select('email, role, expires_at, accepted_at, revoked_at, tenants(name, logo_url)')
        .eq('token_hash', hashInvitationToken(token))
        .maybeSingle()
    : { data: null };
  const state = invitationState(inv);

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const next = `/invitacion/${token}`;
  const loginHref = (mode: 'login' | 'signup') =>
    `/login?mode=${mode}&next=${encodeURIComponent(next)}${inv?.email ? `&email=${encodeURIComponent(inv.email)}` : ''}`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-6 h-16 flex items-center"><Logo /></header>
      <main className="flex-1 grid place-items-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-xl space-y-5">
          {state === 'valid' ? (
            <>
              <div className="flex items-center gap-3">
                {inv.tenants?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small logo from the business's own storage
                  <img src={inv.tenants.logo_url} alt="" width={48} height={48} className="h-12 w-12 rounded-xl object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-xl bg-primary text-primary-foreground grid place-items-center font-brand text-2xl">
                    {inv.tenants?.name?.slice(0, 1)}
                  </div>
                )}
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Invitación al equipo</p>
                  <h1 className="font-brand text-2xl tracking-wide leading-tight">{inv.tenants?.name}</h1>
                </div>
              </div>
              <div className="rounded-2xl bg-muted/60 p-4 text-sm space-y-1">
                <p><span className="text-muted-foreground">Tu rol:</span> <strong>{ROLE_LABEL[inv.role as 'encargado' | 'cocina']}</strong></p>
                <p className="text-muted-foreground">{ROLE_DESCRIPTION[inv.role as 'encargado' | 'cocina']}</p>
                <p><span className="text-muted-foreground">Para:</span> {inv.email}</p>
              </div>

              {user ? (
                (user.email ?? '').toLowerCase() === inv.email ? (
                  <AcceptInvitation token={token} />
                ) : (
                  <div className="space-y-3">
                    <p role="alert" className="text-sm font-semibold text-red-800">
                      Entraste como {user.email}, pero la invitación es para {inv.email}.
                    </p>
                    <Link href={loginHref('login')} className="flex h-12 items-center justify-center rounded-2xl border-2 border-border font-bold hover:border-primary">
                      Entrar con {inv.email}
                    </Link>
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  <Link href={loginHref('signup')} className="flex h-12 items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground">
                    Crear mi cuenta y unirme
                  </Link>
                  <Link href={loginHref('login')} className="flex h-12 items-center justify-center rounded-2xl border-2 border-border font-bold hover:border-primary">
                    Ya tengo cuenta: entrar
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="text-center space-y-3">
              <span className="text-5xl block" aria-hidden="true">🦍</span>
              <h1 className="font-brand text-2xl tracking-wide">
                {state === 'expired' ? 'La invitación venció' : state === 'used' ? 'Invitación ya usada' : state === 'revoked' ? 'Invitación anulada' : 'Enlace no válido'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {state === 'used'
                  ? 'Ya eres parte del equipo: entra a tu panel.'
                  : 'Pídele al dueño del local que te envíe una invitación nueva.'}
              </p>
              {state === 'used' && (
                <Link href="/dashboard" className="inline-flex h-12 items-center justify-center rounded-2xl bg-primary px-6 font-bold text-primary-foreground">
                  Ir al panel
                </Link>
              )}
            </div>
          )}
        </div>
      </main>
      <footer className="border-t border-border py-4 flex justify-center"><TeoLabsCredit /></footer>
    </div>
  );
}

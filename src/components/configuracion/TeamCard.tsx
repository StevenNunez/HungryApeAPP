'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Loader2, Mail, Copy, Trash2, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { mensajeParaPersona } from '@/lib/errores';
import { ROLE_DESCRIPTION, ROLE_LABEL, type TenantRole } from '@/lib/roles';

interface Member { userId: string; email: string; role: TenantRole; since: string; isYou: boolean }
interface Invitation { id: string; email: string; role: 'encargado' | 'cocina'; expiresAt: string }

const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });

/**
 * Team of the business (owner only): who has access, with which role, and
 * invitations by email. The link is also shown so it can be shared by WhatsApp.
 */
export function TeamCard() {
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'encargado' | 'cocina'>('cocina');
  const [sending, setSending] = useState(false);
  const [lastLink, setLastLink] = useState<{ email: string; link: string; emailed: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'member' | 'invitation'; id: string; label: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [teamAvailable, setTeamAvailable] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/equipo');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'No pudimos cargar el equipo.');
      setTeamAvailable(json.teamAvailable !== false);
      setMembers(json.members);
      setInvitations(json.invitations);
      setLoadError('');
    } catch (e) {
      setLoadError(mensajeParaPersona(e, 'equipo'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/equipo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'No pudimos enviar la invitación.');
      setLastLink({ email: email.trim().toLowerCase(), link: json.link, emailed: json.emailed });
      toast({
        title: json.emailed ? 'Invitación enviada' : 'Invitación creada',
        description: json.emailed ? `Le llegó un correo a ${email}.` : 'No se pudo enviar el correo: comparte el enlace tú mismo.',
      });
      setEmail('');
      void load();
    } catch (err) {
      toast({ title: 'No se pudo invitar', description: mensajeParaPersona(err, 'equipo'), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (!confirm) return;
    setRemoving(true);
    try {
      const res = await fetch('/api/equipo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirm.kind === 'member' ? { memberUserId: confirm.id } : { invitationId: confirm.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'No se pudo completar.');
      toast({ title: confirm.kind === 'member' ? 'Acceso quitado' : 'Invitación anulada' });
      setConfirm(null);
      void load();
    } catch (err) {
      toast({ title: 'No se pudo completar', description: mensajeParaPersona(err, 'equipo'), variant: 'destructive' });
    } finally {
      setRemoving(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Enlace copiado', duration: 2000 });
    } catch {
      toast({ title: 'Cópialo a mano', description: text });
    }
  };

  return (
    <Card className="rounded-panel border-transparent shadow-xl bg-card overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
          <div>
            <CardTitle className="text-xl font-brand uppercase text-primary">Equipo</CardTitle>
            <CardDescription>Quién más entra a tu panel. La cocina no ve caja, reportes ni facturación.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando equipo…</div>
        ) : loadError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-900">
            {loadError}
            <Button size="sm" variant="outline" onClick={() => { setLoading(true); void load(); }}>Reintentar</Button>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {members.map(m => (
              <li key={m.userId} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{m.email}{m.isYou && <span className="text-muted-foreground font-normal"> (tú)</span>}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_LABEL[m.role]} · desde el {fmt(m.since)}</p>
                </div>
                {m.role !== 'dueno' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 text-muted-foreground hover:text-red-800"
                    aria-label={`Quitar el acceso de ${m.email}`}
                    onClick={() => setConfirm({ kind: 'member', id: m.userId, label: m.email })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
            {invitations.map(i => (
              <li key={i.id} className="flex items-center justify-between gap-3 p-3 bg-muted/40">
                <div className="min-w-0">
                  <p className="truncate font-semibold"><Mail className="inline h-3.5 w-3.5 mr-1 -mt-0.5" aria-hidden="true" />{i.email}</p>
                  <p className="text-xs text-muted-foreground">Invitado como {ROLE_LABEL[i.role]} · vence el {fmt(i.expiresAt)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 shrink-0 text-muted-foreground hover:text-red-800"
                  onClick={() => setConfirm({ kind: 'invitation', id: i.id, label: i.email })}
                >
                  Anular
                </Button>
              </li>
            ))}
          </ul>
        )}

        {!loading && !loadError && !teamAvailable && (
          <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-2">
            <p className="font-bold">Equipo: incluido en el Plan Enterprise</p>
            <p className="text-sm text-muted-foreground">
              Suma encargados y cocina con su propia cuenta y solo los permisos de su rol.
              {members.some(m => m.role !== 'dueno') && ' Las personas que ya invitaste tienen el acceso en pausa hasta que actives Enterprise.'}
            </p>
            <Link href="/#pricing" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Ver Plan Enterprise</Link>
          </div>
        )}

        {teamAvailable && (
        <form onSubmit={invite} className="space-y-3 rounded-2xl bg-muted/40 p-4">
          <p className="font-bold">Invitar a alguien</p>
          <div>
            <label htmlFor="team-email" className="text-sm font-medium mb-1.5 block">Correo</label>
            <Input
              id="team-email"
              type="email"
              required
              autoComplete="off"
              placeholder="nombre@correo.cl"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="rounded-xl h-12 bg-background"
            />
          </div>
          <fieldset>
            <legend className="text-sm font-medium mb-1.5">Rol</legend>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {(['cocina', 'encargado'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={role === r}
                  onClick={() => setRole(r)}
                  className={`rounded-2xl border-2 p-3 text-left transition-colors ${role === r ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/40'}`}
                >
                  <span className="block font-bold">{ROLE_LABEL[r]}</span>
                  <span className="block text-xs text-muted-foreground">{ROLE_DESCRIPTION[r]}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <Button type="submit" disabled={sending || !email.trim()} className="w-full min-h-12 font-bold">
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar invitación
          </Button>
          {lastLink && (
            <div className="rounded-xl border border-border bg-background p-3 text-sm space-y-2">
              <p>
                {lastLink.emailed ? 'También puedes mandarle el enlace por WhatsApp' : 'Mándale este enlace'} a <strong>{lastLink.email}</strong> (vence en 7 días):
              </p>
              <div className="flex gap-2">
                <Input readOnly value={lastLink.link} className="h-11 font-mono text-xs" onFocus={e => e.currentTarget.select()} aria-label="Enlace de invitación" />
                <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => copy(lastLink.link)}>
                  <Copy className="h-4 w-4 mr-1" /> Copiar
                </Button>
              </div>
            </div>
          )}
        </form>
        )}

        {confirm && (
          <div role="alertdialog" aria-modal="true" aria-labelledby="team-confirm-title" className="fixed inset-0 z-[300] grid place-items-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => !removing && setConfirm(null)} />
            <div className="relative w-full max-w-sm rounded-3xl bg-card p-6 shadow-2xl space-y-4">
              <h2 id="team-confirm-title" className="font-brand text-xl tracking-wide">
                {confirm.kind === 'member' ? '¿Quitar el acceso?' : '¿Anular la invitación?'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {confirm.kind === 'member'
                  ? <><strong className="text-foreground">{confirm.label}</strong> deja de entrar al panel desde ya. Lo que hizo (pedidos, caja) queda registrado.</>
                  : <>El enlace enviado a <strong className="text-foreground">{confirm.label}</strong> deja de funcionar.</>}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirm(null)} disabled={removing} className="min-h-11">Volver</Button>
                <Button onClick={remove} disabled={removing} className="min-h-11 bg-red-700 text-white hover:bg-red-800">
                  {removing ? 'Quitando…' : confirm.kind === 'member' ? 'Sí, quitar' : 'Sí, anular'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

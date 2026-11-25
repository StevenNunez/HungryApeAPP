'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Banknote, History, LockKeyhole, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PanelSkeleton } from '@/components/compartido/PanelSkeleton';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { getEffectivePlan } from '@/lib/data';
import { canUseCashRegister } from '@/lib/plans';
import { formatCLP } from '@/lib/utils';
import { mensajeParaPersona } from '@/lib/errores';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { elapsed, type CajaOrder, type CashSession, type Withdrawal } from '@/lib/caja';
import {
  addWithdrawal, closeSession, fetchClosedSessions, fetchOpenSession, fetchSessionOrders, fetchWithdrawals, openSession,
} from '@/lib/caja-data';
import { OpenCashForm } from '@/components/caja/OpenCashForm';
import { LiveSession } from '@/components/caja/LiveSession';
import { CloseCashForm } from '@/components/caja/CloseCashForm';
import { CashHistory } from '@/components/caja/CashHistory';

/**
 * Cash register: open the day with the starting cash, follow sales by payment
 * method live, register withdrawals and close with a cash count.
 * Data: src/lib/caja-data.ts · math: src/lib/caja.ts · screens: src/components/caja/.
 */
export default function CajaPage() {
  const { toast } = useToast();
  const { tenant } = useTenant();
  const tenantId = tenant?.id as string | undefined;
  // Landing: "Caja: inicio, cierre y arqueo" is a Starter feature (the trial counts as Starter)
  const locked = tenant ? !canUseCashRegister(getEffectivePlan(tenant)) : false;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [session, setSession] = useState<CashSession | null>(null);
  const [orders, setOrders] = useState<CajaOrder[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [closingView, setClosingView] = useState(false);
  const [busy, setBusy] = useState<null | 'open' | 'withdraw' | 'close'>(null);
  // A double tap must not register an opening/withdrawal/closing twice: state only
  // disables the button after a re-render, a ref blocks immediately.
  const busyRef = useRef(false);

  const refreshLive = useCallback(async (sess: CashSession, id: string) => {
    const [o, w] = await Promise.all([fetchSessionOrders(id, sess), fetchWithdrawals(sess.id)]);
    setOrders(o);
    setWithdrawals(w);
  }, []);

  const load = useCallback(async () => {
    if (!tenantId || locked) { setLoading(false); return; }
    try {
      const [open, closed] = await Promise.all([fetchOpenSession(tenantId), fetchClosedSessions(tenantId)]);
      setSession(open);
      setHistory(closed);
      if (open) await refreshLive(open, tenantId);
      else { setOrders([]); setWithdrawals([]); }
      setLoadError('');
    } catch (e) {
      setLoadError(mensajeParaPersona(e, 'caja: cargar'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, locked, refreshLive]);

  useEffect(() => { void load(); }, [load]);

  // Live: new/updated orders and withdrawals of the open session
  useEffect(() => {
    if (!tenantId || !session) return;
    const supabase = createClient();
    const refresh = () => { void refreshLive(session, tenantId).catch(() => undefined); };
    const ch = supabase.channel(`caja-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cash_withdrawals', filter: `session_id=eq.${session.id}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [tenantId, session, refreshLive]);

  const run = async (kind: 'open' | 'withdraw' | 'close', fn: () => Promise<void>, failTitle: string): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(kind);
    try {
      await fn();
      return true;
    } catch (e) {
      toast({ title: failTitle, description: mensajeParaPersona(e, 'caja'), variant: 'destructive' });
      return false;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const handleOpen = (amount: number) => run('open', async () => {
    const created = await openSession(tenantId!, amount);
    setSession(created);
    setOrders([]);
    setWithdrawals([]);
    toast({ title: '✅ Caja abierta', description: `Iniciaste con ${formatCLP(amount)}` });
  }, 'No se pudo abrir la caja');

  const handleWithdraw = (amount: number, reason: string) => run('withdraw', async () => {
    await addWithdrawal(tenantId!, session!.id, amount, reason);
    toast({ title: '💸 Egreso registrado', description: `${formatCLP(amount)} — ${reason}` });
    setWithdrawals(await fetchWithdrawals(session!.id));
  }, 'No se pudo registrar el egreso');

  const handleClose = (counted: number, notes: string) => run('close', async () => {
    await closeSession(session!.id, counted, notes);
    toast({ title: '🔒 Caja cerrada', description: 'El arqueo quedó registrado.' });
    setClosingView(false);
    await load();
  }, 'No se pudo cerrar la caja');

  if (loading) return <PanelSkeleton cards={3} label="Cargando la caja…" />;

  if (locked) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
          <LockKeyhole className="h-8 w-8 text-amber-800" />
        </div>
        <div className="text-center">
          <h1 className="font-brand text-3xl mb-2">Cierre de Caja</h1>
          <p className="text-muted-foreground mb-4">Disponible en el Plan Starter y superiores.</p>
          <Link href="/#pricing"><Button className="min-h-11">Ver planes →</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center gap-4 px-6">
          <Link href="/dashboard" className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:text-foreground" aria-label="Volver al panel">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" aria-hidden="true" />
            <h1 className="font-brand text-xl tracking-wide">Caja</h1>
          </div>
          {session && (
            <Badge className="bg-green-500/10 text-green-800 border-green-500/20 text-xs font-bold uppercase tracking-widest ml-auto">
              <span className="w-1.5 h-1.5 bg-green-600 rounded-full animate-pulse inline-block mr-1.5" aria-hidden="true" />
              Abierta · {elapsed(session.opened_at)}
            </Badge>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-8">
        {loadError && (
          <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-red-700/40 bg-red-50 px-4 py-3 text-red-900">
            <span className="text-sm font-medium">{loadError}</span>
            <Button size="sm" variant="outline" className="min-h-11" onClick={() => { setLoading(true); void load(); }}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reintentar
            </Button>
          </div>
        )}

        <Tabs defaultValue="caja">
          <TabsList className="mb-6 bg-muted">
            <TabsTrigger value="caja" className="gap-2"><Banknote className="h-4 w-4" />Caja</TabsTrigger>
            <TabsTrigger value="historial" className="gap-2"><History className="h-4 w-4" />Historial</TabsTrigger>
          </TabsList>

          <TabsContent value="caja">
            {!session && !loadError && (
              <OpenCashForm busy={busy === 'open'} lastClosed={history[0] ?? null} onOpen={handleOpen} />
            )}
            {session && !closingView && (
              <LiveSession
                session={session}
                orders={orders}
                withdrawals={withdrawals}
                withdrawing={busy === 'withdraw'}
                onWithdraw={handleWithdraw}
                onStartClose={() => setClosingView(true)}
              />
            )}
            {session && closingView && (
              <CloseCashForm
                session={session}
                orders={orders}
                withdrawals={withdrawals}
                closing={busy === 'close'}
                onCancel={() => setClosingView(false)}
                onClose={handleClose}
              />
            )}
          </TabsContent>

          <TabsContent value="historial">
            {tenantId && <CashHistory tenantId={tenantId} history={history} />}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

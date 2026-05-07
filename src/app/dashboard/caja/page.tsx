'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getEffectivePlan } from '@/lib/data';
import { formatCLP } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Banknote, ArrowLeft, Loader2, LockKeyhole, CheckCircle2,
  CreditCard, Smartphone, ArrowRightLeft, TrendingUp, MinusCircle,
  AlertTriangle, ReceiptText, History, ChevronDown, ChevronUp, Plus, X,
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ──────────────────────────────────────────────────────────────────

type CashSession = {
  id: string;
  tenant_id: string;
  opened_at: string;
  opening_amount: number;
  closed_at: string | null;
  closing_amount: number | null;
  notes: string;
  status: 'open' | 'closed';
};

type Order = {
  id: string;
  nickname: string;
  short_id: number | null;
  payment_method: string;
  total: number;
  status: string;
  created_at: string;
};

type Withdrawal = {
  id: string;
  session_id: string;
  amount: number;
  reason: string;
  created_at: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const PAY_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  qr: 'QR/App',
};

const PAY_COLORS: Record<string, string> = {
  cash: 'bg-green-500/10 text-green-400 border-green-500/20',
  transfer: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  card: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  qr: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsed(from: string): string {
  const ms = Date.now() - new Date(from).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function computeTotals(orders: Order[]) {
  const byMethod: Record<string, number> = { cash: 0, transfer: 0, card: 0, qr: 0 };
  let total = 0;
  for (const o of orders) {
    byMethod[o.payment_method] = (byMethod[o.payment_method] || 0) + o.total;
    total += o.total;
  }
  return { byMethod, total };
}

function computeArqueo(sess: CashSession, orders: Order[], withdrawals: Withdrawal[]) {
  const { byMethod, total } = computeTotals(orders);
  const totalWithdrawals = withdrawals.reduce((s, w) => s + w.amount, 0);
  // Expected cash = opening + cash sales - withdrawals
  const expectedCash = sess.opening_amount + byMethod.cash - totalWithdrawals;
  const actualCash = sess.closing_amount ?? 0;
  const diff = actualCash - expectedCash;
  return { byMethod, total, totalWithdrawals, expectedCash, actualCash, diff };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CajaPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<any>(null);
  const [locked, setLocked] = useState(false);

  // Session
  const [session, setSession] = useState<CashSession | null>(null);
  const [sessionOrders, setSessionOrders] = useState<Order[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);

  // History
  const [history, setHistory] = useState<CashSession[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [historyOrders, setHistoryOrders] = useState<Record<string, Order[]>>({});
  const [historyWithdrawals, setHistoryWithdrawals] = useState<Record<string, Withdrawal[]>>({});

  // Opening form
  const [openingAmount, setOpeningAmount] = useState('');
  const [opening, setOpening] = useState(false);

  // Closing form
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closingAmount, setClosingAmount] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [closing, setClosing] = useState(false);

  // Withdrawal form
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadSessionOrders = useCallback(async (sess: CashSession, tenantId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('orders')
      .select('id, nickname, short_id, payment_method, total, status, created_at')
      .eq('tenant_id', tenantId)
      .neq('status', 'Por Pagar')
      .gte('created_at', sess.opened_at)
      .order('created_at', { ascending: false }) as any;
    setSessionOrders(data || []);
  }, []);

  const loadWithdrawals = useCallback(async (sess: CashSession) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('cash_withdrawals')
      .select('*')
      .eq('session_id', sess.id)
      .order('created_at', { ascending: false }) as any;
    setWithdrawals(data || []);
  }, []);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: t } = await supabase
      .from('tenants').select('*').eq('owner_id', user.id).single() as any;
    if (!t) { router.push('/dashboard'); return; }
    setTenant(t);

    if (getEffectivePlan(t) === 'gratis') {
      setLocked(true);
      setLoading(false);
      return;
    }

    const { data: openSess } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('tenant_id', t.id)
      .eq('status', 'open')
      .maybeSingle() as any;

    setSession(openSess || null);
    if (openSess) {
      await Promise.all([
        loadSessionOrders(openSess, t.id),
        loadWithdrawals(openSess),
      ]);
    }

    const { data: hist } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('tenant_id', t.id)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(20) as any;
    setHistory(hist || []);

    setLoading(false);
  }, [router, loadSessionOrders, loadWithdrawals]);

  useEffect(() => { load(); }, [load]);

  // Realtime: orders and withdrawals
  useEffect(() => {
    if (!tenant?.id || !session) return;
    const supabase = createClient();
    const ch = supabase.channel('caja-live')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `tenant_id=eq.${tenant.id}`,
      }, () => loadSessionOrders(session, tenant.id))
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'cash_withdrawals',
        filter: `session_id=eq.${session.id}`,
      }, () => loadWithdrawals(session))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenant?.id, session, loadSessionOrders, loadWithdrawals]);

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleOpenCaja() {
    const amount = parseFloat(openingAmount) || 0;
    if (amount < 0) {
      toast({ title: 'Monto inválido', variant: 'destructive' });
      return;
    }
    setOpening(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('cash_sessions').insert({
      tenant_id: tenant.id,
      opened_by: user!.id,
      opening_amount: amount,
    }).select().single() as any;

    if (error) {
      toast({ title: 'Error al abrir caja', description: error.message, variant: 'destructive' });
      setOpening(false);
      return;
    }
    setSession(data);
    setSessionOrders([]);
    setWithdrawals([]);
    setOpeningAmount('');
    toast({ title: '✅ Caja abierta', description: `Iniciaste con ${formatCLP(amount)}` });
    setOpening(false);
  }

  async function handleWithdraw() {
    if (!session) return;
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      toast({ title: 'Monto inválido', description: 'Ingresa un monto mayor a 0.', variant: 'destructive' });
      return;
    }
    if (!withdrawReason.trim()) {
      toast({ title: 'Motivo requerido', description: 'Describe el motivo del egreso.', variant: 'destructive' });
      return;
    }
    setWithdrawing(true);
    const supabase = createClient();
    const { error } = await supabase.from('cash_withdrawals').insert({
      session_id: session.id,
      tenant_id: tenant.id,
      amount,
      reason: withdrawReason.trim(),
    }) as any;

    if (error) {
      toast({ title: 'Error al registrar egreso', description: error.message, variant: 'destructive' });
      setWithdrawing(false);
      return;
    }
    toast({ title: '💸 Egreso registrado', description: `${formatCLP(amount)} — ${withdrawReason}` });
    setWithdrawAmount('');
    setWithdrawReason('');
    setShowWithdrawForm(false);
    setWithdrawing(false);
    await loadWithdrawals(session);
  }

  async function handleCloseCaja() {
    if (!session) return;
    const amount = parseFloat(closingAmount);
    if (isNaN(amount) || amount < 0) {
      toast({ title: 'Monto inválido', description: 'Ingresa el efectivo contado.', variant: 'destructive' });
      return;
    }
    setClosing(true);
    const supabase = createClient();
    const { error } = await supabase.from('cash_sessions').update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closing_amount: amount,
      notes: closingNotes,
    }).eq('id', session.id) as any;

    if (error) {
      toast({ title: 'Error al cerrar caja', description: error.message, variant: 'destructive' });
      setClosing(false);
      return;
    }
    toast({ title: '🔒 Caja cerrada', description: 'El arqueo quedó registrado.' });
    setShowCloseForm(false);
    setClosingAmount('');
    setClosingNotes('');
    setClosing(false);
    await load();
  }

  async function loadHistoryData(sess: CashSession) {
    if (historyOrders[sess.id] !== undefined) return;
    const supabase = createClient();

    const ordersQuery = supabase
      .from('orders')
      .select('id, nickname, short_id, payment_method, total, status, created_at')
      .eq('tenant_id', tenant.id)
      .neq('status', 'Por Pagar')
      .gte('created_at', sess.opened_at);
    if (sess.closed_at) (ordersQuery as any).lte('created_at', sess.closed_at);
    const { data: orders } = await (ordersQuery as any).order('created_at', { ascending: false });

    const { data: wds } = await supabase
      .from('cash_withdrawals')
      .select('*')
      .eq('session_id', sess.id)
      .order('created_at', { ascending: false }) as any;

    setHistoryOrders(prev => ({ ...prev, [sess.id]: orders || [] }));
    setHistoryWithdrawals(prev => ({ ...prev, [sess.id]: wds || [] }));
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const { byMethod: liveByMethod, total: liveTotal } = computeTotals(sessionOrders);
  const liveTotalWithdrawals = withdrawals.reduce((s, w) => s + w.amount, 0);

  // ── Guards ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (locked) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
          <LockKeyhole className="h-8 w-8 text-amber-500" />
        </div>
        <div className="text-center">
          <h1 className="font-brand text-3xl mb-2">Cierre de Caja</h1>
          <p className="text-muted-foreground mb-4">Disponible en el Plan Starter y superiores.</p>
          <Link href="/#pricing"><Button>Ver planes →</Button></Link>
        </div>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Volver al dashboard
        </Link>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center gap-4 px-6">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            <h1 className="font-brand text-xl tracking-wide">Caja</h1>
          </div>
          {session && (
            <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[11px] font-bold uppercase tracking-widest ml-auto">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block mr-1.5" />
              Abierta · {elapsed(session.opened_at)}
            </Badge>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-8">
        <Tabs defaultValue="caja">
          <TabsList className="mb-6 bg-muted">
            <TabsTrigger value="caja" className="gap-2">
              <Banknote className="h-4 w-4" />Caja
            </TabsTrigger>
            <TabsTrigger value="historial" className="gap-2">
              <History className="h-4 w-4" />Historial
            </TabsTrigger>
          </TabsList>

          {/* ══════════════════════════════════════════════════════════════
              TAB: CAJA
          ══════════════════════════════════════════════════════════════ */}
          <TabsContent value="caja">

            {/* ── Sin sesión: Iniciar Caja ── */}
            {!session && (
              <div className="max-w-md mx-auto">
                <Card className="border-border">
                  <CardHeader className="text-center pb-2">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <Banknote className="h-7 w-7 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">Iniciar Caja</CardTitle>
                    <CardDescription>
                      Registra el monto inicial en efectivo antes de comenzar a vender.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        Efectivo inicial en caja (CLP)
                      </label>
                      <Input
                        type="number"
                        placeholder="Ej: 50000"
                        value={openingAmount}
                        onChange={e => setOpeningAmount(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleOpenCaja()}
                        className="text-lg"
                        min="0"
                      />
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Billetes y monedas con que arrancas el día. Puede ser $0.
                      </p>
                    </div>
                    <Button
                      className="w-full h-12 text-base font-bold"
                      onClick={handleOpenCaja}
                      disabled={opening}
                    >
                      {opening && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Abrir Caja
                    </Button>
                  </CardContent>
                </Card>
                {history.length > 0 && (
                  <p className="text-center text-xs text-muted-foreground mt-4">
                    Última caja: {fmtDate(history[0].opened_at)} · cierre {formatCLP(history[0].closing_amount ?? 0)}
                  </p>
                )}
              </div>
            )}

            {/* ── Sesión abierta: vista en vivo ── */}
            {session && !showCloseForm && (
              <div className="space-y-5">

                {/* Banner sesión */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-green-500/5 border border-green-500/20 rounded-2xl px-5 py-4">
                  <div>
                    <p className="text-sm font-bold text-green-400">Caja abierta</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Desde las <strong>{fmtTime(session.opened_at)}</strong> · Apertura: <strong>{formatCLP(session.opening_amount)}</strong>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 font-bold border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                      onClick={() => { setShowWithdrawForm(v => !v); setShowCloseForm(false); }}
                    >
                      <MinusCircle className="h-4 w-4" />
                      Sacar de Caja
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-2 font-bold"
                      onClick={() => { setShowCloseForm(true); setShowWithdrawForm(false); }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Cerrar Caja
                    </Button>
                  </div>
                </div>

                {/* ── Formulario de egreso (inline) ── */}
                {showWithdrawForm && (
                  <Card className="border-red-500/30 bg-red-500/5">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2 text-red-400">
                          <MinusCircle className="h-4 w-4" />
                          Registrar Egreso de Caja
                        </CardTitle>
                        <button
                          onClick={() => { setShowWithdrawForm(false); setWithdrawAmount(''); setWithdrawReason(''); }}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium mb-1.5 block">Monto (CLP)</label>
                          <Input
                            type="number"
                            placeholder="Ej: 15000"
                            value={withdrawAmount}
                            onChange={e => setWithdrawAmount(e.target.value)}
                            min="1"
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-1.5 block">Motivo</label>
                          <Input
                            placeholder="Proveedor, cambio, gasto..."
                            value={withdrawReason}
                            onChange={e => setWithdrawReason(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleWithdraw()}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setShowWithdrawForm(false); setWithdrawAmount(''); setWithdrawReason(''); }}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          className="gap-2 bg-red-600 hover:bg-red-700 font-bold"
                          onClick={handleWithdraw}
                          disabled={withdrawing || !withdrawAmount || !withdrawReason.trim()}
                        >
                          {withdrawing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Confirmar Egreso
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'Efectivo', value: liveByMethod.cash, icon: Banknote, color: 'text-green-400', bg: 'bg-green-500/10' },
                    { label: 'Transferencia', value: liveByMethod.transfer, icon: ArrowRightLeft, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                    { label: 'Tarjeta', value: liveByMethod.card, icon: CreditCard, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                    { label: 'QR / App', value: liveByMethod.qr, icon: Smartphone, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                    { label: 'Egresos', value: liveTotalWithdrawals, icon: MinusCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
                    { label: 'Total Ventas', value: liveTotal, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
                  ].map(({ label, value, icon: Icon, color, bg }) => (
                    <Card key={label} className="border-border">
                      <CardContent className="p-4">
                        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                          <Icon className={`h-4 w-4 ${color}`} />
                        </div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className={`text-base font-bold ${color} mt-0.5`}>{formatCLP(value)}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Lista de egresos */}
                {withdrawals.length > 0 && (
                  <Card className="border-red-500/20">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2 text-red-400">
                          <MinusCircle className="h-4 w-4" />
                          Egresos de caja
                        </CardTitle>
                        <span className="text-xs text-muted-foreground">{withdrawals.length} egreso{withdrawals.length !== 1 ? 's' : ''} · {formatCLP(liveTotalWithdrawals)}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left text-xs text-muted-foreground font-medium px-6 py-2">Hora</th>
                              <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2">Motivo</th>
                              <th className="text-right text-xs text-muted-foreground font-medium px-6 py-2">Monto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {withdrawals.map(w => (
                              <tr key={w.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                <td className="px-6 py-2.5 text-muted-foreground text-xs">{fmtTime(w.created_at)}</td>
                                <td className="px-3 py-2.5">{w.reason}</td>
                                <td className="px-6 py-2.5 text-right font-bold text-red-400">-{formatCLP(w.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Pedidos de la sesión */}
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ReceiptText className="h-4 w-4 text-primary" />
                        Pedidos en esta sesión
                      </CardTitle>
                      <span className="text-xs text-muted-foreground">{sessionOrders.length} pedido{sessionOrders.length !== 1 ? 's' : ''}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    {sessionOrders.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8 px-6">
                        Aún no hay pedidos en esta sesión.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left text-xs text-muted-foreground font-medium px-6 py-2">#</th>
                              <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2">Cliente</th>
                              <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2">Hora</th>
                              <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2">Método</th>
                              <th className="text-right text-xs text-muted-foreground font-medium px-6 py-2">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sessionOrders.map(o => (
                              <tr key={o.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                <td className="px-6 py-2.5 text-muted-foreground font-mono text-xs">
                                  {o.short_id ? `#${o.short_id}` : '—'}
                                </td>
                                <td className="px-3 py-2.5 font-medium">{o.nickname}</td>
                                <td className="px-3 py-2.5 text-muted-foreground text-xs">{fmtTime(o.created_at)}</td>
                                <td className="px-3 py-2.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${PAY_COLORS[o.payment_method] || 'bg-muted text-muted-foreground border-border'}`}>
                                    {PAY_LABELS[o.payment_method] || o.payment_method}
                                  </span>
                                </td>
                                <td className="px-6 py-2.5 text-right font-bold">{formatCLP(o.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-muted/40">
                              <td colSpan={4} className="px-6 py-3 text-sm font-bold">Total ventas</td>
                              <td className="px-6 py-3 text-right font-bold text-primary">{formatCLP(liveTotal)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Cerrar Caja: formulario de arqueo ── */}
            {session && showCloseForm && (
              <div className="max-w-lg mx-auto space-y-5">
                <div>
                  <h2 className="text-2xl font-brand tracking-wide">Cerrar Caja</h2>
                  <p className="text-muted-foreground text-sm mt-1">Cuenta el efectivo físico y confirma el cierre.</p>
                </div>

                {(() => {
                  const { byMethod, total, totalWithdrawals, expectedCash } = computeArqueo(session, sessionOrders, withdrawals);
                  const closingVal = parseFloat(closingAmount) || 0;
                  const diff = closingVal - expectedCash;
                  const hasDiff = closingAmount !== '' && !isNaN(parseFloat(closingAmount));

                  return (
                    <>
                      {/* Resumen */}
                      <Card className="border-border">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs text-muted-foreground font-normal uppercase tracking-widest">Resumen de la sesión</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Apertura</span>
                            <span className="font-medium">{formatCLP(session.opening_amount)}</span>
                          </div>
                          {Object.entries(byMethod).filter(([, v]) => v > 0).map(([k, v]) => (
                            <div key={k} className="flex justify-between">
                              <span className="text-muted-foreground">+ {PAY_LABELS[k]}</span>
                              <span className="font-medium">{formatCLP(v)}</span>
                            </div>
                          ))}
                          {totalWithdrawals > 0 && (
                            <div className="flex justify-between text-red-400">
                              <span>− Egresos ({withdrawals.length})</span>
                              <span className="font-medium">-{formatCLP(totalWithdrawals)}</span>
                            </div>
                          )}
                          <div className="flex justify-between border-t border-border pt-2 mt-1">
                            <span className="font-bold">Total ventas</span>
                            <span className="font-bold text-primary">{formatCLP(total)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Efectivo esperado en caja</span>
                            <span className="font-semibold text-green-400">{formatCLP(expectedCash)}</span>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Arqueo */}
                      <Card className="border-border">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs text-muted-foreground font-normal uppercase tracking-widest">Arqueo</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <label className="text-sm font-medium block mb-1.5">
                              Efectivo físico contado (CLP)
                            </label>
                            <Input
                              type="number"
                              placeholder="Cuenta los billetes y monedas"
                              value={closingAmount}
                              onChange={e => setClosingAmount(e.target.value)}
                              className="text-lg"
                              min="0"
                              autoFocus
                            />
                          </div>

                          {hasDiff && (
                            <div className={`flex items-start gap-3 rounded-xl px-4 py-3 ${
                              diff === 0
                                ? 'bg-green-500/10 border border-green-500/20'
                                : diff > 0
                                  ? 'bg-blue-500/10 border border-blue-500/20'
                                  : 'bg-red-500/10 border border-red-500/20'
                            }`}>
                              {diff === 0
                                ? <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                                : <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${diff > 0 ? 'text-blue-400' : 'text-red-400'}`} />
                              }
                              <div>
                                <p className={`text-sm font-bold ${diff === 0 ? 'text-green-400' : diff > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                  {diff === 0 && 'Caja cuadrada ✓'}
                                  {diff > 0 && `Sobrante: ${formatCLP(diff)}`}
                                  {diff < 0 && `Faltante: ${formatCLP(Math.abs(diff))}`}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {diff === 0 && 'El efectivo contado coincide exactamente con lo esperado.'}
                                  {diff > 0 && 'Hay más efectivo del esperado. Revisa si hubo cambio extra.'}
                                  {diff < 0 && 'Hay menos del esperado. Verifica cobros en efectivo o egresos.'}
                                </p>
                              </div>
                            </div>
                          )}

                          <div>
                            <label className="text-sm font-medium block mb-1.5">Notas (opcional)</label>
                            <Input
                              placeholder="Observaciones del cierre..."
                              value={closingNotes}
                              onChange={e => setClosingNotes(e.target.value)}
                            />
                          </div>
                        </CardContent>
                      </Card>

                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => setShowCloseForm(false)}
                          disabled={closing}
                        >
                          Cancelar
                        </Button>
                        <Button
                          className="flex-1 font-bold"
                          onClick={handleCloseCaja}
                          disabled={closing || !closingAmount}
                        >
                          {closing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                          Confirmar Cierre
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════
              TAB: HISTORIAL
          ══════════════════════════════════════════════════════════════ */}
          <TabsContent value="historial">
            {history.length === 0 ? (
              <div className="text-center py-16">
                <History className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-muted-foreground">No hay cierres anteriores todavía.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map(sess => {
                  const orders = historyOrders[sess.id] || [];
                  const wds = historyWithdrawals[sess.id] || [];
                  const { byMethod, total, totalWithdrawals, expectedCash, actualCash, diff } = computeArqueo(sess, orders, wds);
                  const isExpanded = expandedSession === sess.id;

                  return (
                    <Card key={sess.id} className="border-border overflow-hidden">
                      <button
                        className="w-full text-left"
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedSession(null);
                          } else {
                            setExpandedSession(sess.id);
                            loadHistoryData(sess);
                          }
                        }}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-sm">{fmtDate(sess.opened_at)}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {fmtTime(sess.opened_at)} → {sess.closed_at ? fmtTime(sess.closed_at) : '—'}
                                {' · '} Apertura: {formatCLP(sess.opening_amount)}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <p className="text-sm font-bold text-primary">{formatCLP(total)}</p>
                                {sess.closing_amount !== null && (
                                  <p className={`text-xs font-bold ${diff > 0 ? 'text-blue-400' : diff < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                    {diff === 0 ? '✓ Cuadrada' : diff > 0 ? `+${formatCLP(diff)}` : `-${formatCLP(Math.abs(diff))}`}
                                  </p>
                                )}
                              </div>
                              {isExpanded
                                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              }
                            </div>
                          </div>
                        </CardHeader>
                      </button>

                      {isExpanded && (
                        <CardContent className="pt-0 space-y-4 border-t border-border">
                          {/* Ventas por método */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
                            {Object.entries(byMethod).map(([k, v]) => (
                              <div key={k} className="bg-muted/40 rounded-xl p-3">
                                <p className="text-xs text-muted-foreground">{PAY_LABELS[k]}</p>
                                <p className="font-bold text-sm mt-0.5">{formatCLP(v)}</p>
                              </div>
                            ))}
                          </div>

                          {/* Egresos */}
                          {wds.length > 0 && (
                            <div className="rounded-xl border border-red-500/20 overflow-hidden">
                              <div className="px-4 py-2 bg-red-500/5 border-b border-red-500/10">
                                <p className="text-xs font-bold text-red-400 uppercase tracking-widest">
                                  Egresos — {formatCLP(totalWithdrawals)}
                                </p>
                              </div>
                              {wds.map(w => (
                                <div key={w.id} className="flex justify-between items-center px-4 py-2 border-b border-border/40 last:border-0 text-sm">
                                  <div>
                                    <span className="font-medium">{w.reason}</span>
                                    <span className="text-muted-foreground text-xs ml-2">{fmtTime(w.created_at)}</span>
                                  </div>
                                  <span className="font-bold text-red-400">-{formatCLP(w.amount)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Arqueo */}
                          {sess.closing_amount !== null && (
                            <div className={`rounded-xl px-4 py-3 text-sm ${
                              diff === 0
                                ? 'bg-green-500/10 border border-green-500/20'
                                : diff > 0
                                  ? 'bg-blue-500/10 border border-blue-500/20'
                                  : 'bg-red-500/10 border border-red-500/20'
                            }`}>
                              <div className="flex justify-between"><span className="text-muted-foreground">Efectivo esperado</span><span className="font-medium">{formatCLP(expectedCash)}</span></div>
                              <div className="flex justify-between mt-1"><span className="text-muted-foreground">Efectivo contado</span><span className="font-medium">{formatCLP(actualCash)}</span></div>
                              <div className={`flex justify-between mt-2 pt-2 border-t border-current/20 font-bold ${diff === 0 ? 'text-green-400' : diff > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                <span>{diff === 0 ? 'Caja cuadrada' : diff > 0 ? 'Sobrante' : 'Faltante'}</span>
                                <span>{diff === 0 ? '✓' : formatCLP(Math.abs(diff))}</span>
                              </div>
                            </div>
                          )}

                          {sess.notes && (
                            <p className="text-xs text-muted-foreground italic">Nota: {sess.notes}</p>
                          )}

                          {/* Pedidos */}
                          {orders.length > 0 && (
                            <div className="overflow-x-auto rounded-xl border border-border">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-muted/40 border-b border-border">
                                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2">#</th>
                                    <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2">Cliente</th>
                                    <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2">Hora</th>
                                    <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2">Método</th>
                                    <th className="text-right text-xs text-muted-foreground font-medium px-4 py-2">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {orders.map(o => (
                                    <tr key={o.id} className="border-b border-border/50">
                                      <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{o.short_id ? `#${o.short_id}` : '—'}</td>
                                      <td className="px-3 py-2">{o.nickname}</td>
                                      <td className="px-3 py-2 text-muted-foreground text-xs">{fmtTime(o.created_at)}</td>
                                      <td className="px-3 py-2">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${PAY_COLORS[o.payment_method] || 'bg-muted text-muted-foreground border-border'}`}>
                                          {PAY_LABELS[o.payment_method] || o.payment_method}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2 text-right font-bold">{formatCLP(o.total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Order, OrderStatus } from '@/lib/types';
import { getKitchenOrders, getKitchenOrder, updateOrderStatus as updateStatus, subscribeToOrders, type RealtimeHealth } from '@/lib/data';
import { OrderCard } from './OrderCard';
import { useToast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Loader2, Bell, BellOff, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { mensajeParaPersona, reportarError } from '@/lib/errores';

const mainColumns: OrderStatus[] = ['Por Pagar', 'Pendiente', 'En preparación', 'Listo'];

const columnColors: Record<OrderStatus, string> = {
  'Por Pagar': 'bg-red-500/10 border-red-500/30',
  'Pendiente': 'bg-amber-500/10 border-amber-500/30',
  'En preparación': 'bg-blue-500/10 border-blue-500/30',
  'Listo': 'bg-accent/10 border-accent/30',
  'Entregado': 'bg-green-500/10 border-green-500/30',
  'Cancelado': 'bg-muted border-border/50',
};

const SOUND_KEY = 'hungryape:kitchen-sound';
/** Seconds a kitchen tap can be undone before it is sent to the server. */
const UNDO_SECONDS = 5;
/** Safety-net refresh while the screen is visible, in case a realtime event was missed. */
const POLL_MS = 25_000;
/** Lock after a change is saved, so a late tap on "Deshacer" doesn't hit the next button. */
const SETTLE_MS = 1200;

interface PendingChange {
  from: OrderStatus;
  to: OrderStatus;
  timer: ReturnType<typeof setTimeout>;
}

/** Short two-tone "ding" made with Web Audio (no audio file to download). */
function playNewOrderSound(ctx: AudioContext) {
  const now = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

interface KitchenViewProps {
  tenantSlug: string;
  compact?: boolean;
}

export function KitchenView({ tenantSlug, compact = false }: KitchenViewProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [health, setHealth] = useState<RealtimeHealth>('connecting');
  // Taps waiting UNDO_SECONDS before reaching the server (a wrong tap can be undone)
  const pendingRef = useRef<Map<string, PendingChange>>(new Map());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [soundOn, setSoundOn] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(false);
  const { toast } = useToast();

  // The browser only lets a page play sound after a tap, so the preference is
  // remembered but the audio context is (re)created on the first tap of the button.
  useEffect(() => {
    try { setSoundOn(localStorage.getItem(SOUND_KEY) === '1'); } catch { /* private mode */ }
  }, []);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try { localStorage.setItem(SOUND_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    if (next) {
      try {
        audioRef.current ??= new AudioContext();
        void audioRef.current.resume();
        playNewOrderSound(audioRef.current);
      } catch { /* no Web Audio */ }
    }
  };

  const ring = useCallback(() => {
    if (!soundOnRef.current) return;
    try {
      audioRef.current ??= new AudioContext();
      if (audioRef.current.state === 'suspended') void audioRef.current.resume();
      playNewOrderSound(audioRef.current);
    } catch { /* no Web Audio */ }
    try { navigator.vibrate?.(200); } catch { /* ignore */ }
  }, []);

  const loadOrders = useCallback(async (id: string) => {
    try {
      const fresh = await getKitchenOrders(id);
      // Keep the taps that are still waiting to be sent
      const pending = pendingRef.current;
      setOrders(fresh.map(o => (pending.has(o.id) ? { ...o, status: pending.get(o.id)!.to } : o)));
      setLoadError(false);
    } catch (e) {
      setLoadError(true);
      reportarError('cocina: cargar pedidos', e);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: tenant } = await supabase
        .from('tenants_public')
        .select('id')
        .eq('slug', tenantSlug)
        .single();

      if (tenant) {
        setTenantId(tenant.id);
        await loadOrders(tenant.id);
      } else {
        setLoadError(true);
      }
      setLoading(false);
    }
    load();
  }, [tenantSlug, loadOrders]);

  // Realtime: a new order is fetched alone (its items are committed in the same
  // transaction, so they are already there when the event arrives).
  useEffect(() => {
    if (!tenantId) return;

    const upsert = (order: Order) =>
      setOrders(prev => {
        const exists = prev.some(o => o.id === order.id);
        return exists ? prev.map(o => (o.id === order.id ? order : o)) : [...prev, order];
      });

    const unsubscribe = subscribeToOrders(
      tenantId,
      async (newRow) => {
        try {
          const order = await getKitchenOrder(newRow.id);
          if (order) upsert(order);
        } catch {
          void loadOrders(tenantId);
        }
        ring();
        toast({
          title: '🦍 ¡Nuevo Pedido!',
          description: `${newRow.nickname || 'Cliente'} — Código: ${newRow.pickup_code}`,
        });
      },
      (updatedRow) => {
        const status = updatedRow.status as OrderStatus;
        if (pendingRef.current.has(updatedRow.id)) return; // our own tap is about to be sent
        setOrders(prev => {
          if (status === 'Cancelado') return prev.filter(o => o.id !== updatedRow.id);
          return prev.map(order =>
            order.id === updatedRow.id
              ? { ...order, status, paidOnline: !!updatedRow.paid_online }
              : order,
          );
        });
      },
      (h) => {
        setHealth(prev => {
          // Back online after a drop: catch up with whatever arrived meanwhile
          if (h === 'live' && prev === 'offline') void loadOrders(tenantId);
          return h;
        });
      },
    );

    return unsubscribe;
  }, [tenantId, toast, ring, loadOrders]);

  // Safety net: refresh when the tablet wakes up / the wifi returns, and every
  // POLL_MS while visible — realtime is the fast path, not the only one.
  useEffect(() => {
    if (!tenantId) return;
    const refresh = () => { if (document.visibilityState === 'visible') void loadOrders(tenantId); };
    const interval = setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [tenantId, loadOrders]);

  const setSaving = (orderId: string, saving: boolean) =>
    setSavingIds(prev => {
      const next = new Set(prev);
      if (saving) next.add(orderId); else next.delete(orderId);
      return next;
    });

  const markPending = (orderId: string, on: boolean) =>
    setPendingIds(prev => {
      const next = new Set(prev);
      if (on) next.add(orderId); else next.delete(orderId);
      return next;
    });

  const setStatusLocally = (orderId: string, status: OrderStatus) =>
    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status } : o)));

  /** Sends a tap to the server once its undo window is over (or right away when leaving). */
  const commit = useCallback(async (orderId: string) => {
    const change = pendingRef.current.get(orderId);
    if (!change) return;
    clearTimeout(change.timer);
    pendingRef.current.delete(orderId);
    markPending(orderId, false);
    setSaving(orderId, true);
    try {
      await updateStatus(orderId, change.to);
    } catch (err: any) {
      setStatusLocally(orderId, change.from);
      toast({
        title: 'No se pudo guardar el cambio',
        description: mensajeParaPersona(err, 'cocina'),
        variant: 'destructive',
      });
      if (tenantId) void loadOrders(tenantId);
    } finally {
      // The next action button appears exactly where "Deshacer" was: keep the card
      // locked a moment so a late tap meant for "Deshacer" can't advance it again.
      setTimeout(() => setSaving(orderId, false), SETTLE_MS);
    }
  }, [tenantId, loadOrders, toast]);

  const undo = (orderId: string) => {
    const change = pendingRef.current.get(orderId);
    if (!change) return;
    clearTimeout(change.timer);
    pendingRef.current.delete(orderId);
    markPending(orderId, false);
    setStatusLocally(orderId, change.from);
  };

  // Leaving the page (or the tablet locking) sends what's pending instead of losing it
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') {
        for (const id of [...pendingRef.current.keys()]) void commit(id);
      }
    };
    const flushAll = () => { for (const id of [...pendingRef.current.keys()]) void commit(id); };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flushAll);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flushAll);
      flushAll();
    };
  }, [commit]);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    if (savingIds.has(orderId) || pendingRef.current.has(orderId)) return;
    const current = orders.find(o => o.id === orderId);
    if (!current) return;

    if (newStatus === 'Cancelado') {
      // Already confirmed in a dialog: goes straight to the server
      setSaving(orderId, true);
      setOrders(prev => prev.filter(o => o.id !== orderId));
      try {
        await updateStatus(orderId, 'Cancelado');
        toast({ title: 'Pedido anulado', description: 'El stock volvió al inventario.' });
      } catch (err: any) {
        setOrders(prev => [...prev, current].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
        toast({ title: 'No se pudo anular', description: mensajeParaPersona(err, 'cocina'), variant: 'destructive' });
      } finally {
        setSaving(orderId, false);
      }
      return;
    }

    // Forward moves: applied on screen now, sent after UNDO_SECONDS unless undone
    setStatusLocally(orderId, newStatus);
    const timer = setTimeout(() => { void commit(orderId); }, UNDO_SECONDS * 1000);
    pendingRef.current.set(orderId, { from: current.status, to: newStatus, timer });
    markPending(orderId, true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
        <p className="text-muted-foreground font-brand uppercase tracking-widest text-xs">Sincronizando cocina...</p>
      </div>
    );
  }

  const entregados = orders.filter(o => o.status === 'Entregado').slice(-10);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="status"
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest ${
            health === 'live'
              ? 'bg-green-100 text-green-900'
              : health === 'offline'
              ? 'bg-red-100 text-red-900'
              : 'bg-amber-100 text-amber-900'
          }`}
        >
          {health === 'offline' ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
          {health === 'live' ? 'En vivo' : health === 'offline' ? 'Sin conexión · reintentando' : 'Conectando…'}
          {health === 'live' && <span className="h-2 w-2 rounded-full bg-green-600 animate-pulse" aria-hidden="true" />}
        </div>
        <Button
          variant={soundOn ? 'default' : 'outline'}
          onClick={toggleSound}
          aria-pressed={soundOn}
          className="min-h-11"
        >
          {soundOn ? <Bell className="mr-2 h-4 w-4" /> : <BellOff className="mr-2 h-4 w-4" />}
          {soundOn ? 'Sonido activado' : 'Activar sonido de pedidos'}
        </Button>
      </div>

      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-red-700/40 bg-red-50 px-4 py-3 text-red-900">
          <span className="text-sm font-medium">No pudimos cargar los pedidos. Lo que ves puede estar incompleto.</span>
          <Button size="sm" variant="outline" onClick={() => tenantId && loadOrders(tenantId)} className="min-h-11">
            <RefreshCw className="mr-2 h-4 w-4" /> Reintentar
          </Button>
        </div>
      )}

      <div className={`grid gap-6 items-start ${compact ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'}`}>
        {mainColumns.map(status => {
          const statusOrders = orders.filter(o => o.status === status);
          const orderCount = statusOrders.length;

          return (
            <div
              key={status}
              className={`rounded-panel p-5 h-full min-h-[400px] border-2 transition-all duration-300 ${columnColors[status] || 'bg-muted border-border/50'} ${orderCount > 0 ? 'shadow-lg' : 'opacity-70 hover:opacity-100'}`}
            >
              <div className="flex items-center justify-between mb-6 px-1">
                <div className="flex flex-col">
                  <h2 className="text-sm font-bold uppercase tracking-tighter text-foreground/70">{status}</h2>
                  <div className="h-1 w-8 bg-primary/40 rounded-full mt-1" />
                </div>
                <Badge variant="secondary" className="rounded-lg font-brand text-lg px-2.5 py-0.5 bg-background shadow-sm border-0">
                  {orderCount}
                </Badge>
              </div>

              <div className="space-y-4 min-h-[100px]">
                {statusOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    saving={savingIds.has(order.id)}
                    undoable={pendingIds.has(order.id)}
                    undoSeconds={UNDO_SECONDS}
                    onUndo={undo}
                    onStatusChange={handleStatusChange}
                  />
                ))}
                {orderCount === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-foreground/5 rounded-3xl">
                    <p className="text-xs uppercase font-bold text-muted-foreground tracking-widest">Vacío</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {entregados.length > 0 && (
        <div className="border-t border-border pt-10 mt-10">
          <div className="flex items-center gap-4 mb-6">
            <h2 className="font-brand text-2xl uppercase tracking-wider text-muted-foreground">Últimos Entregados</h2>
            <span className="text-xs font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full">Máx. 10</span>
          </div>
          <div className={`grid gap-4 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
            {[...entregados].reverse().map(order => (
              <div key={order.id} className="opacity-70 hover:opacity-100 transition-opacity grayscale hover:grayscale-0">
                <OrderCard
                  order={order}
                  saving={savingIds.has(order.id)}
                  undoable={pendingIds.has(order.id)}
                  undoSeconds={UNDO_SECONDS}
                  onUndo={undo}
                  onStatusChange={handleStatusChange}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

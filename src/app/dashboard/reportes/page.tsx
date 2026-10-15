'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2, ArrowLeft, TrendingUp, CreditCard, ShoppingBag, Award, LockKeyhole,
  AlertTriangle, Package, CheckCircle2, XCircle, Minus, Plus, Save,
  Percent, Timer, FileSpreadsheet, FileText, Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { formatCLP } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getEffectivePlan } from '@/lib/data';
import { isProPlan } from '@/lib/plans';
import {
  RANGE_LABELS, rangeStart, computeProfitability, computePrepTimes, computeRestockAlerts,
  salesByDay as buildSalesByDay, formatMinutes, type ReportRange,
} from '@/lib/analytics';
import { exportExcel, exportPdf, type ReportTable } from '@/lib/export';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

const LOW_STOCK_THRESHOLD = 5;
const COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'];
const PAY_LABELS: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', qr: 'QR/App', online: 'Pago online',
};
const PAGE = 1000; // Supabase returns at most 1000 rows per request

/** Reads every page of a query (Supabase caps a single response at 1000 rows). */
async function fetchAll<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function StockBadge({ stock }: { stock: number | null }) {
  if (stock === null || stock === undefined) return <Badge variant="outline" className="text-xs">Sin control</Badge>;
  if (stock === 0) return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-xs">Sin stock</Badge>;
  if (stock <= LOW_STOCK_THRESHOLD) return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs">Stock bajo ({stock})</Badge>;
  return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">{stock} uds.</Badge>;
}

function ProLock({ feature }: { feature: string }) {
  return (
    <Card className="border-primary/40 shadow-xl">
      <CardContent className="py-16 flex flex-col items-center text-center gap-3">
        <LockKeyhole className="h-12 w-12 text-primary" />
        <h3 className="font-brand text-2xl uppercase tracking-wider">Disponible en el Plan Pro</h3>
        <p className="text-muted-foreground max-w-md text-sm">{feature}</p>
        <Link href="/#pricing">
          <Button className="mt-2 rounded-xl font-bold">Ver Planes</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function InventarioReportesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<any>(null);
  const [locked, setLocked] = useState(false);
  const [isPro, setIsPro] = useState(false);

  // --- Inventario state ---
  const [products, setProducts] = useState<any[]>([]);
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // --- Reportes state ---
  const [range, setRange] = useState<ReportRange>('30d');
  const [reportLoading, setReportLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [exporting, setExporting] = useState<null | 'xlsx' | 'pdf'>(null);

  const fetchProducts = useCallback(async (tenantId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false)
      .order('category', { ascending: true });
    setProducts(data || []);
  }, []);

  // ── Tenant + inventory ────────────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: tData } = await supabase
        .from('tenants').select('*').eq('owner_id', user.id).single();
      if (!tData) return;
      setTenant(tData);

      const currentPlan = getEffectivePlan(tData);
      if (currentPlan === 'gratis') {
        setLocked(true);
        setLoading(false);
        return;
      }
      setIsPro(isProPlan(currentPlan));
      await fetchProducts(tData.id);
      setLoading(false);
    }
    loadData();
  }, [router, fetchProducts]);

  // ── Orders + items for the selected range ─────────────────────────────────
  useEffect(() => {
    if (!tenant?.id || locked) return;
    let cancelled = false;

    async function loadReport() {
      setReportLoading(true);
      try {
        const supabase = createClient();
        const since = rangeStart(range);

        // Timestamps and unit_cost only exist after migration 016 and only matter for Pro
        const orderCols = isPro
          ? 'id, total, status, payment_method, created_at, confirmed_at, preparing_at, ready_at'
          : 'id, total, status, payment_method, created_at';
        const itemCols = isPro
          ? 'order_id, product_id, product_name, quantity, price, unit_cost, orders!inner(tenant_id, status, created_at)'
          : 'order_id, product_id, product_name, quantity, price, orders!inner(tenant_id, status, created_at)';

        const [ords, its] = await Promise.all([
          fetchAll((from, to) => {
            let q = supabase.from('orders').select(orderCols)
              .eq('tenant_id', tenant.id).neq('status', 'Por Pagar')
              .order('created_at', { ascending: true }).range(from, to);
            if (since) q = q.gte('created_at', since);
            return q as any;
          }),
          fetchAll((from, to) => {
            let q = supabase.from('order_items').select(itemCols)
              .eq('orders.tenant_id', tenant.id).neq('orders.status', 'Por Pagar')
              .order('id', { ascending: true }).range(from, to);
            if (since) q = q.gte('orders.created_at', since);
            return q as any;
          }),
        ]);
        if (!cancelled) { setOrders(ords); setItems(its); }
      } catch (err: any) {
        if (!cancelled) {
          toast({ title: 'No se pudieron cargar los reportes', description: err?.message, variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    }
    loadReport();
    return () => { cancelled = true; };
  }, [tenant?.id, locked, isPro, range, toast]);

  // Realtime subscription for stock changes
  useEffect(() => {
    if (!tenant?.id || locked) return;
    const supabase = createClient();
    const channel = supabase
      .channel('inventario-products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tenant.id}` },
        () => { fetchProducts(tenant.id); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, locked, fetchProducts]);

  // ── Derived report data ───────────────────────────────────────────────────
  const totalSales = useMemo(() => orders.reduce((a, o) => a + Number(o.total), 0), [orders]);
  const totalOrders = orders.length;
  const salesByDay = useMemo(() => buildSalesByDay(orders), [orders]);

  const payMethods = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach(o => { map[o.payment_method] = (map[o.payment_method] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ name: PAY_LABELS[k] || k, value: v }));
  }, [orders]);

  const topProduct = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach(i => { map[i.product_name] = (map[i.product_name] || 0) + i.quantity; });
    const entries = Object.entries(map);
    if (entries.length === 0) return { name: 'N/A', qty: 0 };
    const [name, qty] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    return { name, qty };
  }, [items]);

  const currentCosts = useMemo(() => {
    const m: Record<string, number | null> = {};
    products.forEach(p => { m[p.id] = p.cost === null || p.cost === undefined ? null : Number(p.cost); });
    return m;
  }, [products]);

  const profit = useMemo(() => computeProfitability(
    items.map(i => ({
      productId: i.product_id ?? null,
      name: i.product_name,
      quantity: i.quantity,
      price: Number(i.price),
      unitCost: i.unit_cost === null || i.unit_cost === undefined ? null : Number(i.unit_cost),
    })),
    currentCosts,
  ), [items, currentCosts]);

  const prep = useMemo(() => computePrepTimes(
    orders,
    items.map(i => ({ orderId: i.order_id, productId: i.product_id ?? null, name: i.product_name })),
  ), [orders, items]);

  const restock = useMemo(() => computeRestockAlerts(
    products.map(p => ({
      id: p.id, name: p.name, stock: p.stock ?? null,
      cost: p.cost === null || p.cost === undefined ? null : Number(p.cost),
      restock_target: p.restock_target ?? null,
    })),
    LOW_STOCK_THRESHOLD,
  ), [products]);

  // ── Exports ───────────────────────────────────────────────────────────────
  const buildTables = (): ReportTable[] => [
    {
      title: 'Resumen',
      headers: ['Indicador', 'Valor'],
      rows: [
        ['Ventas brutas (CLP)', totalSales],
        ['Pedidos completados', totalOrders],
        ['Producto estrella', `${topProduct.name} (${topProduct.qty} uds.)`],
        ['Costo de lo vendido (CLP)', Math.round(profit.cost)],
        ['Margen (CLP)', Math.round(profit.margin)],
        ['Margen %', profit.marginPct === null ? 'Sin costos cargados' : `${profit.marginPct.toFixed(1)}%`],
        ['Tiempo medio de preparación', formatMinutes(prep.avgPrepMin)],
      ],
    },
    {
      title: 'Ventas por día',
      headers: ['Día', 'Ventas (CLP)'],
      rows: salesByDay.map(d => [d.name, d.total]),
    },
    {
      title: 'Métodos de pago',
      headers: ['Método', 'Pedidos'],
      rows: payMethods.map(p => [p.name, p.value]),
    },
    {
      title: 'Rentabilidad por producto',
      headers: ['Producto', 'Unidades', 'Ventas (CLP)', 'Costo (CLP)', 'Margen (CLP)', 'Margen %'],
      rows: profit.rows.map(r => [
        r.name, r.units, Math.round(r.revenue), Math.round(r.cost), Math.round(r.margin),
        r.marginPct === null ? 'Sin costo' : `${r.marginPct.toFixed(1)}%`,
      ]),
      note: `El margen solo considera ventas con costo cargado (${profit.coveragePct.toFixed(0)}% de tus ventas). Los extras pagados (salsas, agregados) suman a la venta pero no tienen costo.`,
    },
    {
      title: 'Tiempos de preparación',
      headers: ['Producto', 'Pedidos medidos', 'Preparación promedio'],
      rows: prep.perProduct.map(p => [p.name, p.orders, formatMinutes(p.avgPrepMin)]),
      note: `Promedio general: ${formatMinutes(prep.avgPrepMin)} de preparación y ${formatMinutes(prep.avgWaitMin)} desde que se confirma el pago hasta que está listo (${prep.measuredOrders} pedidos medidos).`,
    },
    {
      title: 'Reposición',
      headers: ['Producto', 'Stock', 'A comprar', 'Costo estimado (CLP)'],
      rows: restock.alerts.map(a => [a.name, a.stock, a.toBuy ?? '—', a.estimatedCost === null ? 'Sin dato' : Math.round(a.estimatedCost)]),
      note: `Costo estimado total de reposición: ${formatCLP(restock.totalEstimatedCost)}.`,
    },
  ];

  const handleExport = async (kind: 'xlsx' | 'pdf') => {
    setExporting(kind);
    try {
      const base = `reporte-${tenant?.name ?? 'hungry-ape'}-${RANGE_LABELS[range]}`;
      if (kind === 'xlsx') {
        await exportExcel(base, buildTables());
      } else {
        await exportPdf(base, {
          tenantName: tenant?.name ?? '',
          title: 'Reporte de ventas y rentabilidad',
          subtitle: `${RANGE_LABELS[range]} · generado el ${new Date().toLocaleDateString('es-CL')}`,
          tables: buildTables(),
        });
      }
    } catch (err: any) {
      toast({ title: 'No se pudo generar el archivo', description: err?.message, variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  // ── Inventory handlers ────────────────────────────────────────────────────
  const handleStockSave = async (productId: string) => {
    const rawVal = stockEdits[productId];
    if (rawVal === undefined) return;
    const newStock = parseInt(rawVal, 10);
    if (isNaN(newStock) || newStock < 0) {
      toast({ title: 'Stock inválido', description: 'Ingresa un número mayor o igual a 0.', variant: 'destructive' });
      return;
    }
    setSaving(s => ({ ...s, [productId]: true }));
    const supabase = createClient();
    const { error } = await supabase.from('products')
      .update({ stock: newStock, is_available: newStock > 0 })
      .eq('id', productId);
    if (error) {
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    } else {
      setProducts(ps => ps.map(p => p.id === productId ? { ...p, stock: newStock, is_available: newStock > 0 } : p));
      setStockEdits(e => { const n = { ...e }; delete n[productId]; return n; });
      toast({ title: 'Stock actualizado', description: `Stock guardado: ${newStock} unidades.` });
    }
    setSaving(s => ({ ...s, [productId]: false }));
  };

  const handleToggleAvailability = async (productId: string, current: boolean) => {
    const supabase = createClient();
    const { error } = await supabase.from('products')
      .update({ is_available: !current }).eq('id', productId);
    if (!error) {
      setProducts(ps => ps.map(p => p.id === productId ? { ...p, is_available: !current } : p));
    }
  };

  const handleQuickAdjust = (productId: string, delta: number) => {
    const current = products.find(p => p.id === productId);
    const base = stockEdits[productId] !== undefined
      ? parseInt(stockEdits[productId], 10)
      : (current?.stock ?? 0);
    const next = Math.max(0, base + delta);
    setStockEdits(e => ({ ...e, [productId]: String(next) }));
  };

  const lowStockProducts = products.filter(p => p.stock !== null && p.stock <= LOW_STOCK_THRESHOLD && p.stock > 0);
  const outOfStockProducts = products.filter(p => p.stock === 0);
  const healthyProducts = products.filter(p => p.stock === null || p.stock > LOW_STOCK_THRESHOLD);

  if (loading) {
    return (
      <div className="flex-1 flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const lockedUI = (
    <Card className="border-primary/50 shadow-2xl relative overflow-hidden">
      <div className="absolute inset-0 bg-background/40 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-6 text-center">
        <LockKeyhole className="h-16 w-16 text-primary mb-4" />
        <h2 className="font-brand text-3xl uppercase tracking-wider mb-2">Desbloquea esta sección</h2>
        <p className="text-muted-foreground max-w-md mb-6">
          El Inventario & Reportes es exclusivo del <strong>Plan Starter</strong> o superior.
        </p>
        <Link href="/#pricing">
          <Button className="h-14 px-8 rounded-2xl bg-primary text-primary-foreground font-bold text-lg active:scale-95 transition-all shadow-xl ha-glow-red">
            Ver Planes
          </Button>
        </Link>
      </div>
      <CardContent className="p-10 opacity-30 pointer-events-none filter blur-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="h-32 bg-muted rounded-2xl" />
          <div className="h-32 bg-muted rounded-2xl" />
          <div className="h-32 bg-muted rounded-2xl" />
        </div>
        <div className="h-64 bg-muted rounded-2xl" />
      </CardContent>
    </Card>
  );

  const tabClass = 'rounded-xl px-6 font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm';

  return (
    <div className="container mx-auto px-6 py-10 max-w-7xl animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="font-brand text-4xl tracking-wide uppercase">Inventario & Reportes</h1>
          <p className="text-muted-foreground text-sm font-medium">Control de stock en vivo y radiografía de tus ventas.</p>
        </div>
      </div>

      {locked ? lockedUI : (
        <Tabs defaultValue="inventario" className="w-full">
          <TabsList className="mb-6 h-auto flex-wrap rounded-2xl bg-muted p-1">
            <TabsTrigger value="inventario" className={tabClass}>Inventario</TabsTrigger>
            <TabsTrigger value="reportes" className={tabClass}>Reportes</TabsTrigger>
            <TabsTrigger value="rentabilidad" className={tabClass}>Rentabilidad {!isPro && <span className="ml-1.5 text-[10px] font-bold text-primary">PRO</span>}</TabsTrigger>
            <TabsTrigger value="tiempos" className={tabClass}>Tiempos {!isPro && <span className="ml-1.5 text-[10px] font-bold text-primary">PRO</span>}</TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════ INVENTARIO TAB ═══════════════════════════ */}
          <TabsContent value="inventario" className="space-y-6">

            {/* Alertas */}
            {(lowStockProducts.length > 0 || outOfStockProducts.length > 0) && (
              <div className="space-y-3">
                {outOfStockProducts.length > 0 && (
                  <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-3">
                    <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                    <p className="text-sm font-medium text-red-400">
                      <strong>{outOfStockProducts.length} producto{outOfStockProducts.length > 1 ? 's' : ''} sin stock:</strong>{' '}
                      {outOfStockProducts.map(p => p.name).join(', ')}
                    </p>
                  </div>
                )}
                {lowStockProducts.length > 0 && (
                  <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-3">
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                    <p className="text-sm font-medium text-amber-400">
                      <strong>{lowStockProducts.length} producto{lowStockProducts.length > 1 ? 's' : ''} con stock bajo (≤{LOW_STOCK_THRESHOLD}):</strong>{' '}
                      {lowStockProducts.map(p => `${p.name} (${p.stock})`).join(', ')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Reposición con costo estimado (Pro) */}
            {isPro && restock.alerts.length > 0 && (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="font-brand uppercase tracking-wider text-lg flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-amber-500" /> Reposición estimada
                  </CardTitle>
                  <CardDescription>
                    Para llegar al stock objetivo de cada producto.{' '}
                    {restock.withoutCost > 0 && `${restock.withoutCost} sin costo u objetivo cargado (se carga en Mi Menú).`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-border text-sm">
                    {restock.alerts.map(a => (
                      <div key={a.id} className="flex items-center justify-between py-2 gap-3">
                        <span className="font-medium truncate">{a.name}</span>
                        <span className="text-muted-foreground shrink-0">
                          stock {a.stock}{a.toBuy !== null ? ` · comprar ${a.toBuy}` : ''}
                        </span>
                        <span className="font-bold shrink-0 w-28 text-right">
                          {a.estimatedCost === null ? '—' : formatCLP(a.estimatedCost)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between pt-3 mt-1 border-t border-border font-bold">
                    <span>Total estimado</span>
                    <span>{formatCLP(restock.totalEstimatedCost)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resumen cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-green-500/20 bg-green-500/5">
                <CardContent className="pt-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Stock OK</p>
                    <p className="text-3xl font-brand">{healthyProducts.length}</p>
                  </div>
                  <CheckCircle2 className="h-8 w-8 text-green-500 opacity-80" />
                </CardContent>
              </Card>
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="pt-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Stock Bajo</p>
                    <p className="text-3xl font-brand">{lowStockProducts.length}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-amber-500 opacity-80" />
                </CardContent>
              </Card>
              <Card className="border-red-500/20 bg-red-500/5">
                <CardContent className="pt-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Sin Stock</p>
                    <p className="text-3xl font-brand">{outOfStockProducts.length}</p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-500 opacity-80" />
                </CardContent>
              </Card>
            </div>

            {/* Tabla de productos */}
            {products.length === 0 ? (
              <Card className="border-border">
                <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
                  <Package className="h-12 w-12 opacity-30" />
                  <p className="text-sm">No tienes productos activos. Agrégalos desde <Link href="/dashboard/menu" className="text-primary underline">Mi Menú</Link>.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border overflow-hidden">
                <CardHeader className="pb-0 border-b border-border">
                  <div className="flex items-center justify-between pb-4">
                    <CardTitle className="font-brand uppercase tracking-wider text-xl">Productos</CardTitle>
                    <span className="text-xs text-muted-foreground">{products.length} producto{products.length !== 1 ? 's' : ''}</span>
                  </div>
                </CardHeader>
                <div className="divide-y divide-border">
                  {products.map(product => {
                    const editVal = stockEdits[product.id];
                    const displayStock = editVal !== undefined ? editVal : String(product.stock ?? '');
                    const isDirty = editVal !== undefined;
                    const isSaving = saving[product.id];

                    return (
                      <div key={product.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-muted/40 transition-colors">
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate">{product.name}</span>
                            {product.category && (
                              <Badge variant="outline" className="text-[10px] px-2 py-0">{product.category}</Badge>
                            )}
                            <StockBadge stock={product.stock} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatCLP(product.price)}
                            {isPro && product.cost !== null && product.cost !== undefined && ` · costo ${formatCLP(Number(product.cost))}`}
                          </p>
                        </div>

                        {/* Disponibilidad toggle */}
                        <button
                          onClick={() => handleToggleAvailability(product.id, product.is_available)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
                            product.is_available
                              ? 'bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20'
                              : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                          }`}
                        >
                          {product.is_available ? 'Disponible' : 'No disponible'}
                        </button>

                        {/* Control de stock */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleQuickAdjust(product.id, -1)}
                            className="h-8 w-8 rounded-lg border border-border hover:bg-muted flex items-center justify-center transition-colors"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <Input
                            type="number"
                            min={0}
                            value={displayStock}
                            onChange={e => setStockEdits(ed => ({ ...ed, [product.id]: e.target.value }))}
                            className="h-8 w-20 text-center text-sm rounded-lg [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            onClick={() => handleQuickAdjust(product.id, 1)}
                            className="h-8 w-8 rounded-lg border border-border hover:bg-muted flex items-center justify-center transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <Button
                            size="sm"
                            disabled={!isDirty || isSaving}
                            onClick={() => handleStockSave(product.id)}
                            className="h-8 px-3 rounded-lg"
                          >
                            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Selector de rango + exportación (compartido por las pestañas de reportes) */}
          {/* ═══════════════════════════ REPORTES TAB ═══════════════════════════ */}
          <TabsContent value="reportes">
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <RangePicker range={range} onChange={setRange} loading={reportLoading} />
                <ExportButtons isPro={isPro} exporting={exporting} onExport={handleExport} />
              </div>

              {/* KPIS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-border hover:border-primary/20 transition-all shadow-md">
                  <CardContent className="pt-6 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Ventas Brutas</p>
                      <h3 className="text-3xl font-brand tracking-tighter text-foreground">{formatCLP(totalSales)}</h3>
                    </div>
                    <div className="h-12 w-12 bg-green-500/10 text-green-500 rounded-2xl flex items-center justify-center">
                      <TrendingUp className="h-6 w-6" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border hover:border-primary/20 transition-all shadow-md">
                  <CardContent className="pt-6 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Pedidos</p>
                      <h3 className="text-3xl font-brand tracking-tighter text-foreground">
                        {totalOrders} <span className="text-sm font-normal text-muted-foreground lowercase">completados</span>
                      </h3>
                    </div>
                    <div className="h-12 w-12 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center">
                      <ShoppingBag className="h-6 w-6" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border hover:border-accent/40 shadow-[0_0_20px_-5px_rgba(250,204,21,0.2)] transition-all">
                  <CardContent className="pt-6 flex items-start justify-between">
                    <div className="truncate pr-4">
                      <p className="text-sm font-bold text-accent uppercase tracking-widest mb-1">Producto Estrella 🏆</p>
                      <h3 className="text-xl font-bold truncate">{topProduct.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{topProduct.qty} unidades vendidas</p>
                    </div>
                    <div className="h-12 w-12 shrink-0 bg-accent/20 text-accent-foreground rounded-2xl flex items-center justify-center rotate-12">
                      <Award className="h-6 w-6" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="border-border shadow-md">
                  <CardHeader>
                    <CardTitle className="font-brand uppercase tracking-wider">Ventas por Día</CardTitle>
                    <CardDescription>{RANGE_LABELS[range]}.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px] w-full">
                      {salesByDay.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={salesByDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                            <YAxis tickFormatter={(val) => `$${val / 1000}k`} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                            <RechartsTooltip
                              cursor={{ fill: 'rgba(200,200,200,0.1)' }}
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}
                              formatter={(value: any) => [formatCLP(value), 'Ventas']}
                            />
                            <Bar dataKey="total" fill="#ef4444" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                          No hay datos suficientes para graficar.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border shadow-md">
                  <CardHeader>
                    <CardTitle className="font-brand uppercase tracking-wider flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                      Métodos de Pago
                    </CardTitle>
                    <CardDescription>Cómo prefieren pagar tus clientes.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px] w-full">
                      {payMethods.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={payMethods} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                              {payMethods.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                          No hay suficientes cobros procesados.
                        </div>
                      )}
                    </div>
                    {payMethods.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-4 mt-2">
                        {payMethods.map((pm, i) => (
                          <div key={pm.name} className="flex items-center gap-2 text-sm font-medium">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            {pm.name} ({pm.value})
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ═══════════════════════════ RENTABILIDAD TAB (Pro) ═══════════════════════════ */}
          <TabsContent value="rentabilidad">
            {!isPro ? (
              <ProLock feature="Carga el costo de cada producto y mira cuánto ganas realmente: margen por producto, margen total y cuáles te dejan más plata." />
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <RangePicker range={range} onChange={setRange} loading={reportLoading} />
                  <ExportButtons isPro={isPro} exporting={exporting} onExport={handleExport} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="border-border shadow-md">
                    <CardContent className="pt-6">
                      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Margen</p>
                      <h3 className="text-3xl font-brand tracking-tighter">{formatCLP(profit.margin)}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {profit.marginPct === null ? 'Carga costos para calcularlo' : `${profit.marginPct.toFixed(1)}% sobre lo vendido con costo`}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-border shadow-md">
                    <CardContent className="pt-6">
                      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Costo de lo vendido</p>
                      <h3 className="text-3xl font-brand tracking-tighter">{formatCLP(profit.cost)}</h3>
                      <p className="text-xs text-muted-foreground mt-1">Ventas totales: {formatCLP(profit.revenue)}</p>
                    </CardContent>
                  </Card>
                  <Card className={`shadow-md ${profit.coveragePct < 80 ? 'border-amber-500/40' : 'border-border'}`}>
                    <CardContent className="pt-6 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Ventas con costo</p>
                        <h3 className="text-3xl font-brand tracking-tighter">{profit.coveragePct.toFixed(0)}%</h3>
                        {profit.coveragePct < 100 && (
                          <p className="text-xs text-amber-600 mt-1">
                            Carga el costo en <Link href="/dashboard/menu" className="underline">Mi Menú</Link> para medir todo.
                          </p>
                        )}
                      </div>
                      <Percent className="h-8 w-8 text-muted-foreground opacity-60" />
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-border overflow-hidden">
                  <CardHeader className="border-b border-border">
                    <CardTitle className="font-brand uppercase tracking-wider text-xl">Margen por producto</CardTitle>
                    <CardDescription>
                      Usa el costo vigente cuando se vendió. Los extras pagados (salsas, agregados) suman a la venta, pero no llevan costo.
                    </CardDescription>
                  </CardHeader>
                  {profit.rows.length === 0 ? (
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">No hay ventas en este período.</CardContent>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="text-left px-5 py-3">Producto</th>
                            <th className="text-right px-3 py-3">Uds.</th>
                            <th className="text-right px-3 py-3">Ventas</th>
                            <th className="text-right px-3 py-3">Costo</th>
                            <th className="text-right px-3 py-3">Margen</th>
                            <th className="text-right px-5 py-3">%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {profit.rows.map(r => (
                            <tr key={r.key} className="hover:bg-muted/30">
                              <td className="px-5 py-3 font-medium">{r.name}{!r.complete && <span className="ml-2 text-[10px] text-amber-600 font-bold">SIN COSTO</span>}</td>
                              <td className="text-right px-3 py-3">{r.units}</td>
                              <td className="text-right px-3 py-3">{formatCLP(r.revenue)}</td>
                              <td className="text-right px-3 py-3">{formatCLP(r.cost)}</td>
                              <td className="text-right px-3 py-3 font-bold">{formatCLP(r.margin)}</td>
                              <td className={`text-right px-5 py-3 font-bold ${r.marginPct !== null && r.marginPct < 30 ? 'text-red-500' : 'text-green-600'}`}>
                                {r.marginPct === null ? '—' : `${r.marginPct.toFixed(0)}%`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ═══════════════════════════ TIEMPOS TAB (Pro) ═══════════════════════════ */}
          <TabsContent value="tiempos">
            {!isPro ? (
              <ProLock feature="Mide cuánto demora tu cocina: tiempo de preparación promedio y por producto, y cuánto espera el cliente desde que paga." />
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <RangePicker range={range} onChange={setRange} loading={reportLoading} />
                  <ExportButtons isPro={isPro} exporting={exporting} onExport={handleExport} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="border-border shadow-md">
                    <CardContent className="pt-6 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Preparación promedio</p>
                        <h3 className="text-3xl font-brand tracking-tighter">{formatMinutes(prep.avgPrepMin)}</h3>
                        <p className="text-xs text-muted-foreground mt-1">De &quot;En preparación&quot; a &quot;Listo&quot;</p>
                      </div>
                      <Timer className="h-8 w-8 text-muted-foreground opacity-60" />
                    </CardContent>
                  </Card>
                  <Card className="border-border shadow-md">
                    <CardContent className="pt-6">
                      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Espera del cliente</p>
                      <h3 className="text-3xl font-brand tracking-tighter">{formatMinutes(prep.avgWaitMin)}</h3>
                      <p className="text-xs text-muted-foreground mt-1">Del pago confirmado a &quot;Listo&quot;</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border shadow-md">
                    <CardContent className="pt-6">
                      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Pedidos medidos</p>
                      <h3 className="text-3xl font-brand tracking-tighter">{prep.measuredOrders}</h3>
                      <p className="text-xs text-muted-foreground mt-1">Solo cuentan los pedidos desde que se activó esta función.</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-border overflow-hidden">
                  <CardHeader className="border-b border-border">
                    <CardTitle className="font-brand uppercase tracking-wider text-xl">Por producto</CardTitle>
                    <CardDescription>
                      Promedio de los pedidos que incluyen el producto (un ticket se prepara completo, así que en pedidos mixtos es una aproximación).
                    </CardDescription>
                  </CardHeader>
                  {prep.perProduct.length === 0 ? (
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                      Aún no hay pedidos con tiempos medidos. Se registran al pasar los pedidos por &quot;En preparación&quot; y &quot;Listo&quot; en la cocina.
                    </CardContent>
                  ) : (
                    <div className="divide-y divide-border">
                      {prep.perProduct.map(p => (
                        <div key={p.name} className="flex items-center justify-between px-5 py-3 text-sm">
                          <span className="font-medium truncate pr-3">{p.name}</span>
                          <span className="text-muted-foreground shrink-0 mr-6">{p.orders} pedido{p.orders !== 1 ? 's' : ''}</span>
                          <span className="font-bold shrink-0 w-20 text-right">{formatMinutes(p.avgPrepMin)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ─── Small shared pieces ──────────────────────────────────────────────────────

function RangePicker({ range, onChange, loading }: { range: ReportRange; onChange: (r: ReportRange) => void; loading: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(Object.keys(RANGE_LABELS) as ReportRange[]).map(r => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`text-xs font-semibold px-3.5 py-2 rounded-xl border transition-all ${
            range === r ? 'bg-primary text-primary-foreground border-primary shadow-md' : 'border-border text-muted-foreground hover:border-primary/50'
          }`}
        >
          {RANGE_LABELS[r]}
        </button>
      ))}
      {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

function ExportButtons({ isPro, exporting, onExport }: { isPro: boolean; exporting: null | 'xlsx' | 'pdf'; onExport: (k: 'xlsx' | 'pdf') => void }) {
  if (!isPro) {
    return (
      <Link href="/#pricing" className="text-xs font-semibold text-primary underline">
        Descargar Excel / PDF: disponible en Pro
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="rounded-xl" disabled={exporting !== null} onClick={() => onExport('xlsx')}>
        {exporting === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
        Excel
      </Button>
      <Button variant="outline" size="sm" className="rounded-xl" disabled={exporting !== null} onClick={() => onExport('pdf')}>
        {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
        PDF
      </Button>
    </div>
  );
}

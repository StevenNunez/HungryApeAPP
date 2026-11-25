'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PanelSkeleton } from '@/components/compartido/PanelSkeleton';
import { useTenant } from '@/hooks/useTenant';
import { fetchInventory, fetchReportData } from '@/lib/reportes-data';
import { InventoryTab } from '@/components/reportes/InventoryTab';
import { LOW_STOCK_THRESHOLD, ProLock, RangePicker, ExportButtons } from '@/components/reportes/parts';
import { ArrowLeft, TrendingUp, CreditCard, ShoppingBag, Award, LockKeyhole, Percent, Timer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { formatCLP } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getEffectivePlan } from '@/lib/data';
import { isProPlan, canUseReports } from '@/lib/plans';
import { RANGE_LABELS, computeProfitability, computePrepTimes, computeRestockAlerts, salesByDay as buildSalesByDay, formatMinutes, type ReportRange } from '@/lib/analytics';
import { exportExcel, exportPdf, type ReportTable } from '@/lib/export';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { mensajeParaPersona } from '@/lib/errores';

const COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'];
const PAY_LABELS: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', qr: 'QR/App', online: 'Pago online',
};

export default function InventarioReportesPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const { tenant: ctxTenant } = useTenant();
  const [tenant, setTenant] = useState<any>(null);
  const [locked, setLocked] = useState(false);
  const [isPro, setIsPro] = useState(false);

  // --- Inventario state ---
  const [products, setProducts] = useState<any[]>([]);

  // --- Reportes state ---
  const [range, setRange] = useState<ReportRange>('30d');
  const [reportLoading, setReportLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [exporting, setExporting] = useState<null | 'xlsx' | 'pdf'>(null);

  const fetchProducts = useCallback(async (tenantId: string) => {
    try {
      setProducts(await fetchInventory(tenantId));
    } catch (err) {
      toast({ title: 'No se pudo cargar el inventario', description: mensajeParaPersona(err, 'reportes: inventario'), variant: 'destructive' });
    }
  }, [toast]);

  // ── Tenant + inventory ────────────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      // The business comes already loaded from the panel layout
      const tData = ctxTenant;
      if (!tData) return;
      setTenant(tData);

      const currentPlan = getEffectivePlan(tData);
      if (!canUseReports(currentPlan)) {
        setLocked(true);
        setLoading(false);
        return;
      }
      setIsPro(isProPlan(currentPlan));
      await fetchProducts(tData.id);
      setLoading(false);
    }
    loadData();
  }, [ctxTenant, fetchProducts]);

  // ── Orders + items for the selected range ─────────────────────────────────
  useEffect(() => {
    if (!tenant?.id || locked) return;
    let cancelled = false;

    async function loadReport() {
      setReportLoading(true);
      try {
        const { orders: ords, items: its } = await fetchReportData(tenant.id, range, isPro);
        if (!cancelled) { setOrders(ords); setItems(its); }
      } catch (err: any) {
        if (!cancelled) {
          toast({ title: 'No se pudieron cargar los reportes', description: mensajeParaPersona(err, 'reportes'), variant: 'destructive' });
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
      toast({ title: 'No se pudo generar el archivo', description: mensajeParaPersona(err, 'reportes'), variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return <PanelSkeleton label="Cargando reportes…" />;
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
            <TabsTrigger value="rentabilidad" className={tabClass}>Rentabilidad {!isPro && <span className="ml-1.5 text-xs font-bold text-primary">PRO</span>}</TabsTrigger>
            <TabsTrigger value="tiempos" className={tabClass}>Tiempos {!isPro && <span className="ml-1.5 text-xs font-bold text-primary">PRO</span>}</TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════ INVENTARIO TAB ═══════════════════════════ */}
          <TabsContent value="inventario" className="space-y-6">

            <InventoryTab products={products} setProducts={setProducts} restock={restock} isPro={isPro} />
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
                    <div className="h-12 w-12 bg-green-500/10 text-green-800 rounded-2xl flex items-center justify-center">
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
                    <div className="h-12 w-12 bg-blue-500/10 text-blue-800 rounded-2xl flex items-center justify-center">
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
                          <p className="text-xs text-amber-800 mt-1">
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
                              <td className="px-5 py-3 font-medium">{r.name}{!r.complete && <span className="ml-2 text-xs text-amber-800 font-bold">SIN COSTO</span>}</td>
                              <td className="text-right px-3 py-3">{r.units}</td>
                              <td className="text-right px-3 py-3">{formatCLP(r.revenue)}</td>
                              <td className="text-right px-3 py-3">{formatCLP(r.cost)}</td>
                              <td className="text-right px-3 py-3 font-bold">{formatCLP(r.margin)}</td>
                              <td className={`text-right px-5 py-3 font-bold ${r.marginPct !== null && r.marginPct < 30 ? 'text-red-700' : 'text-green-800'}`}>
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

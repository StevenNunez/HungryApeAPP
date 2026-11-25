'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PanelSkeleton } from '@/components/compartido/PanelSkeleton';
import { useTenant } from '@/hooks/useTenant';
import { fetchInventory, fetchReportData } from '@/lib/reportes-data';
import { InventoryTab } from '@/components/reportes/InventoryTab';
import { LOW_STOCK_THRESHOLD, ProLock, RangePicker, ExportButtons } from '@/components/reportes/parts';
import { SalesTab, ProfitTab, PrepTab } from '@/components/reportes/ReportTabs';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { formatCLP } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getEffectivePlan } from '@/lib/data';
import { isProPlan, canUseReports } from '@/lib/plans';
import { RANGE_LABELS, computeProfitability, computePrepTimes, computeRestockAlerts, salesByDay as buildSalesByDay, formatMinutes, type ReportRange } from '@/lib/analytics';
import { exportExcel, exportPdf, type ReportTable } from '@/lib/export';
import { mensajeParaPersona } from '@/lib/errores';

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

  // Range + export, shared by the report tabs
  const toolbar = (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <RangePicker range={range} onChange={setRange} loading={reportLoading} />
      <ExportButtons isPro={isPro} exporting={exporting} onExport={handleExport} />
    </div>
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

          <TabsContent value="reportes" className="space-y-8">
            {toolbar}
            <SalesTab
              totalSales={totalSales}
              totalOrders={totalOrders}
              topProduct={topProduct}
              salesByDay={salesByDay}
              payMethods={payMethods}
              rangeLabel={RANGE_LABELS[range]}
            />
          </TabsContent>

          <TabsContent value="rentabilidad" className="space-y-6">
            {!isPro ? (
              <ProLock feature="Mira cuánto ganas realmente: margen por producto, margen total y cuáles te dejan más plata." />
            ) : (<>{toolbar}<ProfitTab profit={profit} /></>)}
          </TabsContent>

          <TabsContent value="tiempos" className="space-y-6">
            {!isPro ? (
              <ProLock feature="Mide cuánto demora tu cocina: tiempo de preparación promedio y por producto, y cuánto espera el cliente desde que paga." />
            ) : (<>{toolbar}<PrepTab prep={prep} /></>)}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2, ArrowLeft, TrendingUp, CreditCard, ShoppingBag, Award, LockKeyhole,
  AlertTriangle, Package, CheckCircle2, XCircle, Minus, Plus, Save, RefreshCw,
  BoxesIcon
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { formatCLP } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

const LOW_STOCK_THRESHOLD = 5;
const COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981'];

function StockBadge({ stock }: { stock: number | null }) {
  if (stock === null || stock === undefined) return <Badge variant="outline" className="text-xs">Sin control</Badge>;
  if (stock === 0) return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-xs">Sin stock</Badge>;
  if (stock <= LOW_STOCK_THRESHOLD) return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs">Stock bajo ({stock})</Badge>;
  return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">{stock} uds.</Badge>;
}

export default function InventarioReportesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<any>(null);
  const [locked, setLocked] = useState(false);

  // --- Inventario state ---
  const [products, setProducts] = useState<any[]>([]);
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [realtimeLoading, setRealtimeLoading] = useState(false);

  // --- Reportes state ---
  const [totalSales, setTotalSales] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [topProduct, setTopProduct] = useState({ name: 'N/A', qty: 0 });
  const [salesByDay, setSalesByDay] = useState<any[]>([]);
  const [payMethods, setPayMethods] = useState<any[]>([]);

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

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: tData } = await supabase
        .from('tenants').select('*').eq('owner_id', user.id).single() as any;
      if (!tData) return;
      setTenant(tData);

      const currentPlan = (tData as any).plan_id || 'gratis';
      if (currentPlan === 'gratis') {
        setLocked(true);
        setLoading(false);
        return;
      }

      // Load inventario
      await fetchProducts((tData as any).id);

      // Load reportes
      const { data: orders } = await (supabase
        .from('orders')
        .select('id, total, status, payment_method, created_at')
        .eq('tenant_id', (tData as any).id)
        .neq('status', 'Por Pagar') as any);

      const { data: items } = await (supabase
        .from('order_items')
        .select(`product_name, quantity, orders!inner(tenant_id, status)`)
        .eq('orders.tenant_id', (tData as any).id)
        .neq('orders.status', 'Por Pagar') as any);

      if (orders && orders.length > 0) {
        setTotalOrders(orders.length);
        setTotalSales(orders.reduce((acc: number, o: any) => acc + Number(o.total), 0));

        const pmMap: Record<string, number> = {};
        orders.forEach((o: any) => { pmMap[o.payment_method] = (pmMap[o.payment_method] || 0) + 1; });
        const payLabels: Record<string, string> = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', qr: 'QR/App' };
        setPayMethods(Object.entries(pmMap).map(([k, v]) => ({ name: payLabels[k] || k, value: v })));

        const daysMap: Record<string, number> = {};
        orders.forEach((o: any) => {
          const d = new Date(o.created_at).toLocaleDateString('es-CL', { weekday: 'short' });
          daysMap[d] = (daysMap[d] || 0) + Number(o.total);
        });
        setSalesByDay(Object.entries(daysMap).map(([k, v]) => ({ name: k, total: v })));
      }

      if (items && items.length > 0) {
        const prodMap: Record<string, number> = {};
        items.forEach((i: any) => { prodMap[i.product_name] = (prodMap[i.product_name] || 0) + i.quantity; });
        const [topName, topQty] = Object.entries(prodMap).reduce((a, b) => b[1] > a[1] ? b : a, ['N/A', 0]);
        setTopProduct({ name: topName, qty: topQty as number });
      }

      setLoading(false);
    }
    loadData();
  }, [router, fetchProducts]);

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
    const { error } = await (supabase.from('products') as any)
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
    const { error } = await (supabase.from('products') as any)
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
          <TabsList className="mb-6 h-12 rounded-2xl bg-muted p-1">
            <TabsTrigger value="inventario" className="rounded-xl px-6 font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm">
              Inventario
            </TabsTrigger>
            <TabsTrigger value="reportes" className="rounded-xl px-6 font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm">
              Reportes
            </TabsTrigger>
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
                  <p className="text-sm">No tenés productos activos. Agregalos desde <Link href="/dashboard/menu" className="text-primary underline">Mi Menú</Link>.</p>
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
                          <p className="text-xs text-muted-foreground mt-0.5">{formatCLP(product.price)}</p>
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

          {/* ═══════════════════════════ REPORTES TAB ═══════════════════════════ */}
          <TabsContent value="reportes">
            <div className="space-y-8">
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
                    <CardDescription>Resumen de tus últimos días operativos.</CardDescription>
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
        </Tabs>
      )}
    </div>
  );
}

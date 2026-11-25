'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Boxes, Plus, ShoppingCart, PackageMinus, ClipboardCheck, Pencil, Archive, AlertTriangle, XCircle, RefreshCw, Clock,
} from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { PanelSkeleton } from '@/components/compartido/PanelSkeleton';
import { ProLock } from '@/components/reportes/parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getEffectivePlan, startOfTodayInChile } from '@/lib/data';
import { canUseSupplies } from '@/lib/plans';
import { formatCLP } from '@/lib/utils';
import { mensajeParaPersona } from '@/lib/errores';
import {
  MOVEMENT_LABEL, formatQty, formatQtyShort, runOutForecast, supplyLevel, toBuy,
  type RecipeLine, type Supply, type SupplyMovement,
} from '@/lib/insumos';
import {
  archiveSupply, createSupply, fetchMovements, fetchOptionRecipes, fetchProductRecipes, fetchSalesSince, fetchSupplies,
  recordMovement, updateSupply, type SupplyInput,
} from '@/lib/insumos-data';
import { MovementDialog, SupplyFormDialog, type MovementKind } from '@/components/insumos/SupplyDialogs';
import { RecipesTab } from '@/components/insumos/RecipesTab';

const fmtTime = (d: Date) => d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });

/**
 * Supplies by recipe (Pro): every paid order deducts what its products use
 * (bread, sausage, grams of avocado…); cancelling returns it. Products with a
 * recipe sell out on their own when a supply runs out.
 */
export default function InsumosPage() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const tenantId = tenant?.id as string | undefined;
  const allowed = tenant ? canUseSupplies(getEffectivePlan(tenant)) : false;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [movements, setMovements] = useState<SupplyMovement[]>([]);
  const [salesToday, setSalesToday] = useState<SupplyMovement[]>([]);
  const [productRecipes, setProductRecipes] = useState<Record<string, RecipeLine[]>>({});
  const [optionRecipes, setOptionRecipes] = useState<Record<string, RecipeLine[]>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supply | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ supply: Supply; kind: MovementKind } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !allowed) { setLoading(false); return; }
    try {
      const [s, m, today, pr, or] = await Promise.all([
        fetchSupplies(tenantId),
        fetchMovements(tenantId),
        fetchSalesSince(tenantId, startOfTodayInChile()),
        fetchProductRecipes(tenantId),
        fetchOptionRecipes(tenantId),
      ]);
      setSupplies(s); setMovements(m); setSalesToday(today); setProductRecipes(pr); setOptionRecipes(or);
      setLoadError('');
    } catch (e) {
      setLoadError(mensajeParaPersona(e, 'insumos: cargar'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, allowed]);

  useEffect(() => { void load(); }, [load]);

  const supplyName = useMemo(() => new Map(supplies.map(s => [s.id, s])), [supplies]);
  const usedIn = useMemo(() => {
    const m = new Map<string, number>();
    for (const lines of Object.values(productRecipes)) for (const l of lines) m.set(l.supply_id, (m.get(l.supply_id) ?? 0) + 1);
    return m;
  }, [productRecipes]);

  const out = supplies.filter(s => supplyLevel(s) === 'agotado');
  const low = supplies.filter(s => supplyLevel(s) === 'bajo');
  // Shopping list: what is low or out, up to its target stock
  const shoppingNeeded = supplies
    .filter(s => supplyLevel(s) !== 'ok')
    .map(s => ({ s, qty: toBuy(s) }))
    .filter((x): x is { s: Supply; qty: number } => x.qty !== null && x.qty > 0);
  const shoppingCost = shoppingNeeded.reduce((sum, x) => sum + (x.s.cost_per_unit ?? 0) * x.qty, 0);

  const saveSupply = async (input: SupplyInput, initialStock: number) => {
    if (!tenantId) return;
    setBusy(true);
    try {
      if (editing) await updateSupply(editing.id, input);
      else await createSupply(tenantId, input, initialStock);
      toast({ title: editing ? 'Insumo actualizado' : 'Insumo creado', description: editing ? undefined : 'Ahora agrégalo a las recetas de tus productos.' });
      setFormOpen(false); setEditing(null);
      await load();
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: mensajeParaPersona(e, 'insumos: guardar'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const saveMovement = async (quantity: number, unitCost: number | null, note: string | null) => {
    if (!moveTarget) return;
    setBusy(true);
    try {
      const newStock = await recordMovement(moveTarget.supply.id, moveTarget.kind, quantity, unitCost, note);
      toast({ title: `${MOVEMENT_LABEL[moveTarget.kind]} registrada`, description: `${moveTarget.supply.name}: ahora hay ${formatQty(newStock, moveTarget.supply.unit)}.` });
      setMoveTarget(null);
      await load();
    } catch (e) {
      toast({ title: 'No se pudo registrar', description: mensajeParaPersona(e, 'insumos: movimiento'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const archive = async (s: Supply) => {
    setBusy(true);
    try {
      await archiveSupply(s.id);
      toast({ title: `${s.name} archivado`, description: 'Salió de las recetas; su historial se conserva.' });
      await load();
    } catch (e) {
      toast({ title: 'No se pudo archivar', description: mensajeParaPersona(e, 'insumos: archivar'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PanelSkeleton label="Cargando insumos…" />;

  return (
    <div className="container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <Link href="/dashboard" className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted" aria-label="Volver al panel">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-brand text-3xl sm:text-4xl tracking-wide uppercase">Insumos</h1>
          <p className="text-muted-foreground text-sm">Cada venta pagada descuenta lo que usa: el pan, la salchicha, los gramos de palta.</p>
        </div>
        {allowed && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="min-h-11 font-bold gap-2">
            <Plus className="h-4 w-4" /> Nuevo insumo
          </Button>
        )}
      </div>

      {!allowed ? (
        <ProLock feature="Control de insumos por receta: cada venta descuenta pan, salchicha, palta y salsas; los productos se agotan solos y sabes qué reponer antes de quedarte sin stock." />
      ) : (
        <>
          {loadError && (
            <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-red-700/40 bg-red-50 px-4 py-3 text-red-900">
              <span className="text-sm font-medium">{loadError}</span>
              <Button size="sm" variant="outline" className="min-h-11" onClick={() => { setLoading(true); void load(); }}>
                <RefreshCw className="mr-2 h-4 w-4" /> Reintentar
              </Button>
            </div>
          )}

          <Tabs defaultValue="insumos">
            <TabsList className="mb-6 h-auto flex-wrap rounded-2xl bg-muted p-1">
              <TabsTrigger value="insumos" className="rounded-xl px-5 min-h-11 font-semibold">Insumos</TabsTrigger>
              <TabsTrigger value="recetas" className="rounded-xl px-5 min-h-11 font-semibold">Recetas</TabsTrigger>
              <TabsTrigger value="movimientos" className="rounded-xl px-5 min-h-11 font-semibold">Movimientos</TabsTrigger>
            </TabsList>

            <TabsContent value="insumos" className="space-y-6">
              {(out.length > 0 || low.length > 0) && (
                <div className="space-y-2">
                  {out.length > 0 && (
                    <div role="status" className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-900">
                      <XCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
                      <p><strong>Sin stock:</strong> {out.map(s => s.name).join(', ')}. Los productos que los usan ya no se pueden pedir.</p>
                    </div>
                  )}
                  {low.length > 0 && (
                    <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
                      <p><strong>Quedan pocos:</strong> {low.map(s => `${s.name} (${formatQtyShort(s.stock, s.unit)})`).join(', ')}.</p>
                    </div>
                  )}
                </div>
              )}

              {supplies.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center space-y-3">
                    <Boxes className="h-10 w-10 mx-auto text-muted-foreground" aria-hidden="true" />
                    <p className="font-semibold">Agrega lo que usas para preparar</p>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      Por ejemplo: pan de completo (unidades), vienesas (unidades), palta (gramos), tomate (gramos), mayo (ml).
                      Después, en Recetas, dices cuánto lleva cada producto.
                    </p>
                    <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="min-h-11 font-bold"><Plus className="h-4 w-4 mr-1" /> Primer insumo</Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {supplies.map(s => {
                    const level = supplyLevel(s);
                    const forecast = runOutForecast(s.stock, salesToday.filter(m => m.supply_id === s.id));
                    return (
                      <Card key={s.id} className={`border-2 ${level === 'agotado' ? 'border-red-500/40' : level === 'bajo' ? 'border-amber-500/40' : 'border-border'}`}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold truncate">{s.name}</p>
                              <p className="text-2xl font-brand tracking-wide">{formatQtyShort(s.stock, s.unit)}</p>
                            </div>
                            <Badge className={level === 'agotado' ? 'bg-red-100 text-red-900' : level === 'bajo' ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-900'}>
                              {level === 'agotado' ? 'Sin stock' : level === 'bajo' ? 'Bajo' : 'OK'}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            {forecast && <p className="flex items-center gap-1 font-semibold text-amber-900"><Clock className="h-3.5 w-3.5" /> Al ritmo de hoy se acaba cerca de las {fmtTime(forecast)}</p>}
                            <p>Aviso bajo {formatQtyShort(s.min_stock, s.unit)}{s.target_stock != null && ` · reponer hasta ${formatQtyShort(s.target_stock, s.unit)}`}</p>
                            <p>{s.cost_per_unit != null ? `${formatCLP(s.cost_per_unit)} por ${s.unit === 'unidad' ? 'unidad' : s.unit}` : 'Sin costo cargado'} · en {usedIn.get(s.id) ?? 0} receta{(usedIn.get(s.id) ?? 0) === 1 ? '' : 's'}</p>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <Button variant="outline" size="sm" className="min-h-11 px-1 text-xs" onClick={() => setMoveTarget({ supply: s, kind: 'compra' })}>
                              <ShoppingCart className="h-4 w-4 mr-1" /> Compra
                            </Button>
                            <Button variant="outline" size="sm" className="min-h-11 px-1 text-xs" onClick={() => setMoveTarget({ supply: s, kind: 'merma' })}>
                              <PackageMinus className="h-4 w-4 mr-1" /> Merma
                            </Button>
                            <Button variant="outline" size="sm" className="min-h-11 px-1 text-xs" onClick={() => setMoveTarget({ supply: s, kind: 'ajuste' })}>
                              <ClipboardCheck className="h-4 w-4 mr-1" /> Conteo
                            </Button>
                          </div>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => { setEditing(s); setFormOpen(true); }} aria-label={`Editar ${s.name}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="min-h-11 text-muted-foreground hover:text-red-800" disabled={busy} onClick={() => archive(s)} aria-label={`Archivar ${s.name}`}>
                              <Archive className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {shoppingNeeded.length > 0 && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-lg"><ShoppingCart className="h-5 w-5" /> Lista de compras</CardTitle>
                    <CardDescription>Lo que está bajo, para llegar a tu stock objetivo.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y divide-border text-sm">
                      {shoppingNeeded.map(({ s, qty }) => (
                        <li key={s.id} className="flex justify-between gap-3 py-2">
                          <span className="font-medium">{s.name}</span>
                          <span>{formatQtyShort(qty, s.unit)}{s.cost_per_unit != null && <span className="text-muted-foreground"> · {formatCLP(s.cost_per_unit * qty)}</span>}</span>
                        </li>
                      ))}
                    </ul>
                    {shoppingCost > 0 && (
                      <p className="flex justify-between border-t border-border pt-3 mt-1 font-bold"><span>Total estimado</span><span>{formatCLP(shoppingCost)}</span></p>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="recetas">
              {tenantId && (
                <RecipesTab tenantId={tenantId} supplies={supplies} productRecipes={productRecipes} optionRecipes={optionRecipes} onSaved={load} />
              )}
            </TabsContent>

            <TabsContent value="movimientos">
              {movements.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Todavía no hay movimientos.</p>
              ) : (
                <Card className="border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th scope="col" className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Cuándo</th>
                          <th scope="col" className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Insumo</th>
                          <th scope="col" className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Qué pasó</th>
                          <th scope="col" className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Cantidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements.map(m => {
                          const s = supplyName.get(m.supply_id);
                          return (
                            <tr key={m.id} className="border-b border-border/50">
                              <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                              <td className="px-3 py-2 font-medium">{s?.name ?? 'Insumo archivado'}</td>
                              <td className="px-3 py-2">{MOVEMENT_LABEL[m.kind]}{m.note && <span className="text-muted-foreground"> · {m.note}</span>}</td>
                              <td className={`px-4 py-2 text-right font-bold ${m.quantity < 0 ? 'text-red-700' : 'text-green-800'}`}>
                                {m.quantity > 0 ? '+' : ''}{s ? formatQtyShort(m.quantity, s.unit) : m.quantity}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </TabsContent>
          </Tabs>

          <SupplyFormDialog open={formOpen} supply={editing} busy={busy} onClose={() => { setFormOpen(false); setEditing(null); }} onSave={saveSupply} />
          <MovementDialog supply={moveTarget?.supply ?? null} kind={moveTarget?.kind ?? 'compra'} busy={busy} onClose={() => setMoveTarget(null)} onSave={saveMovement} />
        </>
      )}
    </div>
  );
}

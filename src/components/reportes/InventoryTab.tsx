'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Loader2, Minus, Package, Plus, Save, Wallet, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { formatCLP } from '@/lib/utils';
import { mensajeParaPersona } from '@/lib/errores';
import { setAvailability, setStock } from '@/lib/reportes-data';
import type { computeRestockAlerts } from '@/lib/analytics';
import { LOW_STOCK_THRESHOLD, StockBadge } from './parts';

interface Props {
  products: any[];
  setProducts: (update: (ps: any[]) => any[]) => void;
  restock: ReturnType<typeof computeRestockAlerts>;
  isPro: boolean;
}

/** Inventory tab: stock alerts, Pro restock estimate and per-product stock control. */
export function InventoryTab({ products, setProducts, restock, isPro }: Props) {
  const { toast } = useToast();
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const handleStockSave = async (productId: string) => {
    const rawVal = stockEdits[productId];
    if (rawVal === undefined) return;
    const newStock = parseInt(rawVal, 10);
    if (isNaN(newStock) || newStock < 0) {
      toast({ title: 'Stock inválido', description: 'Ingresa un número mayor o igual a 0.', variant: 'destructive' });
      return;
    }
    setSaving(s => ({ ...s, [productId]: true }));
    try {
      await setStock(productId, newStock);
      setProducts(ps => ps.map(p => (p.id === productId ? { ...p, stock: newStock, is_available: newStock > 0 } : p)));
      setStockEdits(e => { const n = { ...e }; delete n[productId]; return n; });
      toast({ title: 'Stock actualizado', description: `Stock guardado: ${newStock} unidades.` });
    } catch (error) {
      toast({ title: 'No se pudo guardar el stock', description: mensajeParaPersona(error, 'reportes: stock'), variant: 'destructive' });
    } finally {
      setSaving(s => ({ ...s, [productId]: false }));
    }
  };

  const handleToggleAvailability = async (productId: string, current: boolean) => {
    try {
      await setAvailability(productId, !current);
      setProducts(ps => ps.map(p => (p.id === productId ? { ...p, is_available: !current } : p)));
    } catch (error) {
      toast({ title: 'No se pudo cambiar la disponibilidad', description: mensajeParaPersona(error, 'reportes: disponibilidad'), variant: 'destructive' });
    }
  };

  const handleQuickAdjust = (productId: string, delta: number) => {
    const current = products.find(p => p.id === productId);
    const base = stockEdits[productId] !== undefined ? parseInt(stockEdits[productId], 10) : (current?.stock ?? 0);
    setStockEdits(e => ({ ...e, [productId]: String(Math.max(0, (Number.isNaN(base) ? 0 : base) + delta)) }));
  };

  const lowStockProducts = products.filter(p => p.stock !== null && p.stock <= LOW_STOCK_THRESHOLD && p.stock > 0);
  const outOfStockProducts = products.filter(p => p.stock === 0);
  const healthyProducts = products.filter(p => p.stock === null || p.stock > LOW_STOCK_THRESHOLD);

  return (
    <>
            {/* Alertas */}
            {(lowStockProducts.length > 0 || outOfStockProducts.length > 0) && (
              <div className="space-y-3">
                {outOfStockProducts.length > 0 && (
                  <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-3">
                    <XCircle className="h-5 w-5 text-red-700 shrink-0" />
                    <p className="text-sm font-medium text-red-700">
                      <strong>{outOfStockProducts.length} producto{outOfStockProducts.length > 1 ? 's' : ''} sin stock:</strong>{' '}
                      {outOfStockProducts.map(p => p.name).join(', ')}
                    </p>
                  </div>
                )}
                {lowStockProducts.length > 0 && (
                  <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-3">
                    <AlertTriangle className="h-5 w-5 text-amber-800 shrink-0" />
                    <p className="text-sm font-medium text-amber-800">
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
                    <Wallet className="h-5 w-5 text-amber-800" /> Reposición estimada
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
                  <CheckCircle2 className="h-8 w-8 text-green-800 opacity-80" />
                </CardContent>
              </Card>
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="pt-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Stock Bajo</p>
                    <p className="text-3xl font-brand">{lowStockProducts.length}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-amber-800 opacity-80" />
                </CardContent>
              </Card>
              <Card className="border-red-500/20 bg-red-500/5">
                <CardContent className="pt-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Sin Stock</p>
                    <p className="text-3xl font-brand">{outOfStockProducts.length}</p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-700 opacity-80" />
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
                              <Badge variant="outline" className="text-xs px-2 py-0">{product.category}</Badge>
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
                          aria-pressed={product.is_available}
                          className={`min-h-11 text-xs font-semibold px-3 rounded-xl border transition-all shrink-0 ${
                            product.is_available
                              ? 'bg-green-500/10 text-green-800 border-green-500/20 hover:bg-green-500/20'
                              : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                          }`}
                        >
                          {product.is_available ? 'Disponible' : 'No disponible'}
                        </button>

                        {/* Control de stock */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(product.id, -1)}
                            aria-label={`Restar uno al stock de ${product.name}`}
                            className="h-11 w-11 rounded-xl border border-border hover:bg-muted flex items-center justify-center transition-colors"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <Input
                            type="number"
                            min={0}
                            value={displayStock}
                            onChange={e => setStockEdits(ed => ({ ...ed, [product.id]: e.target.value }))}
                            aria-label={`Stock de ${product.name}`}
                            className="h-11 w-20 text-center text-sm rounded-xl [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(product.id, 1)}
                            aria-label={`Sumar uno al stock de ${product.name}`}
                            className="h-11 w-11 rounded-xl border border-border hover:bg-muted flex items-center justify-center transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <Button
                            size="sm"
                            disabled={!isDirty || isSaving}
                            onClick={() => handleStockSave(product.id)}
                            aria-label={`Guardar el stock de ${product.name}`}
                            className="h-11 px-3 rounded-xl"
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
    </>
  );
}

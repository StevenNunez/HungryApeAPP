'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChefHat, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatCLP } from '@/lib/utils';
import { mensajeParaPersona } from '@/lib/errores';
import { formatQtyShort, parseQty, recipeCost, unitsPossible, type RecipeLine, type Supply } from '@/lib/insumos';
import { fetchProductsWithOptions, saveOptionRecipe, saveProductRecipe } from '@/lib/insumos-data';

type Product = Awaited<ReturnType<typeof fetchProductsWithOptions>>[number];
type DraftLine = { supply_id: string; qty: string };

const toDraft = (lines: RecipeLine[] = []): DraftLine[] => lines.map(l => ({ supply_id: l.supply_id, qty: String(l.quantity) }));

function LinesEditor({
  lines, onChange, supplies, allowNegative, idPrefix,
}: {
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  supplies: Supply[];
  allowNegative?: boolean;
  idPrefix: string;
}) {
  const unitOf = (id: string) => supplies.find(s => s.id === id)?.unit;
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={i} className="flex gap-2 items-center">
          <select
            aria-label="Insumo"
            value={l.supply_id}
            onChange={e => onChange(lines.map((x, j) => (j === i ? { ...x, supply_id: e.target.value } : x)))}
            className="flex-1 min-w-0 h-11 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="">Elige un insumo…</option>
            {supplies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Input
            id={`${idPrefix}-${i}`}
            aria-label="Cantidad"
            inputMode="decimal"
            value={l.qty}
            onChange={e => onChange(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
            placeholder={allowNegative ? '+40 / -40' : 'Cantidad'}
            className="h-11 w-24 text-center"
          />
          <span className="w-12 text-xs text-muted-foreground">{l.supply_id ? (unitOf(l.supply_id) === 'unidad' ? 'un.' : unitOf(l.supply_id)) : ''}</span>
          <button
            type="button"
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
            className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:text-red-700 hover:bg-red-50"
            aria-label="Quitar este insumo de la receta"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => onChange([...lines, { supply_id: '', qty: '' }])}>
        <Plus className="h-4 w-4 mr-1" /> Agregar insumo
      </Button>
    </div>
  );
}

function parseLines(lines: DraftLine[], allowNegative: boolean): RecipeLine[] | string {
  const out: RecipeLine[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (!l.supply_id && !l.qty.trim()) continue;
    if (!l.supply_id) return 'Elige el insumo de cada línea.';
    if (seen.has(l.supply_id)) return 'Un insumo aparece dos veces: deja una sola línea con la cantidad total.';
    const q = parseQty(l.qty);
    if (q === null || q === 0 || (!allowNegative && q < 0)) return 'Revisa las cantidades.';
    seen.add(l.supply_id);
    out.push({ supply_id: l.supply_id, quantity: q });
  }
  return out;
}

/** Recipes: what each product (and each of its options) uses from the supplies. */
export function RecipesTab({
  tenantId, supplies, productRecipes, optionRecipes, onSaved,
}: {
  tenantId: string;
  supplies: Supply[];
  productRecipes: Record<string, RecipeLine[]>;
  optionRecipes: Record<string, RecipeLine[]>;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [optionDrafts, setOptionDrafts] = useState<Record<string, DraftLine[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProductsWithOptions(tenantId)
      .then(setProducts)
      .catch(e => toast({ title: 'No se pudieron cargar los productos', description: mensajeParaPersona(e, 'insumos: recetas'), variant: 'destructive' }));
  }, [tenantId, toast]);

  const supplyMap = useMemo(() => new Map(supplies.map(s => [s.id, s])), [supplies]);
  const product = products?.find(p => p.id === selected) ?? null;

  const open = (p: Product) => {
    setSelected(p.id);
    setDraft(toDraft(productRecipes[p.id]));
    const od: Record<string, DraftLine[]> = {};
    for (const g of p.product_modifier_groups) for (const o of g.product_modifier_options) od[o.id] = toDraft(optionRecipes[o.id]);
    setOptionDrafts(od);
  };

  const save = async () => {
    if (!product) return;
    const lines = parseLines(draft, false);
    if (typeof lines === 'string') return toast({ title: 'Revisa la receta', description: lines, variant: 'destructive' });
    const optionLines: Record<string, RecipeLine[]> = {};
    for (const [optionId, d] of Object.entries(optionDrafts)) {
      const parsed = parseLines(d, true);
      if (typeof parsed === 'string') return toast({ title: 'Revisa las opciones', description: parsed, variant: 'destructive' });
      optionLines[optionId] = parsed;
    }
    setSaving(true);
    try {
      await saveProductRecipe(tenantId, product.id, lines);
      for (const [optionId, ls] of Object.entries(optionLines)) {
        const before = JSON.stringify(optionRecipes[optionId] ?? []);
        if (before !== JSON.stringify(ls)) await saveOptionRecipe(tenantId, optionId, ls);
      }
      toast({ title: 'Receta guardada', description: lines.length ? 'Desde ahora cada venta descuenta estos insumos.' : 'El producto vuelve a stock manual.' });
      onSaved();
    } catch (e) {
      toast({ title: 'No se pudo guardar la receta', description: mensajeParaPersona(e, 'insumos: recetas'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (supplies.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Primero agrega tus insumos en la pestaña Insumos.</p>;
  }
  if (!products) return <p className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Cargando productos…</p>;

  const draftParsed = parseLines(draft, false);
  const previewLines = typeof draftParsed === 'string' ? [] : draftParsed;
  const cost = recipeCost(previewLines, supplyMap);
  const units = unitsPossible(previewLines, supplyMap);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
      <ul className="space-y-1.5" aria-label="Productos">
        {products.map(p => {
          const has = (productRecipes[p.id] ?? []).length > 0;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => open(p)}
                aria-current={selected === p.id ? 'true' : undefined}
                className={`w-full min-h-12 rounded-2xl border px-4 py-2 text-left transition-colors ${selected === p.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'}`}
              >
                <span className="block font-semibold text-sm">{p.name}</span>
                <span className={`block text-xs ${has ? 'text-green-800' : 'text-muted-foreground'}`}>
                  {has ? `Con receta · alcanza para ${p.stock}` : 'Sin receta (stock manual)'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {product ? (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ChefHat className="h-5 w-5 text-primary" /> {product.name}</CardTitle>
            <CardDescription>Lo que lleva UNA unidad. Al pagarse cada pedido se descuenta solo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <LinesEditor lines={draft} onChange={setDraft} supplies={supplies} idPrefix="receta" />

            {previewLines.length > 0 && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Costo por receta</p>
                  <p className="font-bold">{cost === null ? 'Falta el costo de algún insumo' : formatCLP(cost)}</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Alcanza para</p>
                  <p className="font-bold">{units} unidades</p>
                </div>
              </div>
            )}

            {product.product_modifier_groups.some(g => g.product_modifier_options.length > 0) && (
              <div className="space-y-4 border-t border-border pt-5">
                <div>
                  <p className="font-bold text-sm">Opciones que cambian la receta</p>
                  <p className="text-xs text-muted-foreground">Positivo suma (Extra palta: 40), negativo resta (Sin tomate: -40). Déjalas vacías si no cambian nada.</p>
                </div>
                {product.product_modifier_groups.map(g => g.product_modifier_options.map(o => (
                  <div key={o.id} className="rounded-2xl border border-border p-3 space-y-2">
                    <p className="text-sm font-semibold">{g.name}: {o.name}</p>
                    <LinesEditor
                      lines={optionDrafts[o.id] ?? []}
                      onChange={ls => setOptionDrafts(d => ({ ...d, [o.id]: ls }))}
                      supplies={supplies}
                      allowNegative
                      idPrefix={`op-${o.id}`}
                    />
                  </div>
                )))}
              </div>
            )}

            <Button onClick={save} disabled={saving} className="w-full min-h-12 font-bold">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar receta
            </Button>
            {previewLines.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Con receta, el stock de este producto lo calculan los insumos: {previewLines.map(l => `${formatQtyShort(l.quantity, supplyMap.get(l.supply_id)?.unit ?? 'unidad')} de ${supplyMap.get(l.supply_id)?.name ?? '?'}`).join(', ')}.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground py-8">Elige un producto para armar su receta.</p>
      )}
    </div>
  );
}

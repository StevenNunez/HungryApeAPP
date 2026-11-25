'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { ImageUploader } from '@/components/ui/image-uploader';
import { createClient } from '@/lib/supabase/client';

const CATEGORY_SUGGESTIONS = [
  'Hamburguesas', 'Completos', 'Empanadas', 'Chorrillanas', 'Papas Fritas', 'Bebidas', 'Combos', 'Postres', 'Sándwiches', 'Pizzas', 'Extras',
];

const labelCls = 'text-xs font-bold uppercase pl-1 block mb-1';

/** Product fields (name, price, category, stock, Pro costs, photo, description). */
export function ProductForm({
  product, onChange, tenantId, productId, canUseCosts,
}: {
  product: any;
  onChange: (p: any) => void;
  tenantId: string;
  /** null when creating a new product */
  productId: string | null;
  canUseCosts: boolean;
}) {
  // A product with a recipe gets its stock (and cost) from its supplies
  const [hasRecipe, setHasRecipe] = useState(false);
  useEffect(() => {
    if (!productId || !canUseCosts) { setHasRecipe(false); return; }
    let cancelled = false;
    (createClient() as any)
      .from('product_recipes').select('supply_id', { count: 'exact', head: true }).eq('product_id', productId)
      .then(({ count, error }: { count: number | null; error: unknown }) => { if (!cancelled) setHasRecipe(!error && (count ?? 0) > 0); });
    return () => { cancelled = true; };
  }, [productId, canUseCosts]);

  const set = (patch: Record<string, unknown>) => onChange({ ...product, ...patch });
  const num = (v: string, empty: number | null) => (v === '' ? empty : Number(v));

  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      <div className="col-span-2">
        <label htmlFor="producto-nombre" className={labelCls}>Nombre del producto</label>
        <Input id="producto-nombre" value={product.name} onChange={e => set({ name: e.target.value })} className="rounded-2xl h-12" placeholder="Ej: Burger Classic" />
      </div>
      <div>
        <label htmlFor="producto-precio" className={labelCls}>Precio ($)</label>
        <Input id="producto-precio" type="number" min={0} inputMode="numeric" placeholder="0" value={product.price || ''}
          onFocus={e => e.target.select()} onChange={e => set({ price: num(e.target.value, 0) })} className="rounded-2xl h-12" />
      </div>
      <div>
        <label htmlFor="producto-categoria" className={labelCls}>Categoría</label>
        <input
          id="producto-categoria"
          list="categories-list"
          className="w-full h-12 bg-muted rounded-2xl px-4 outline-none text-sm font-medium border border-transparent focus:border-primary/30"
          value={product.category}
          onChange={e => set({ category: e.target.value })}
          placeholder="Escribe o elige..."
        />
        <datalist id="categories-list">
          {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
        </datalist>
      </div>
      <div>
        <label htmlFor="producto-stock" className={labelCls}>Stock disponible</label>
        <Input id="producto-stock" type="number" min={0} inputMode="numeric" placeholder="0" value={product.stock || ''}
          disabled={hasRecipe}
          onFocus={e => e.target.select()} onChange={e => set({ stock: num(e.target.value, 0) })} className="rounded-2xl h-12" />
        {hasRecipe && (
          <p className="text-xs text-muted-foreground mt-1 pl-1">
            Lo calculan tus <Link href="/dashboard/insumos" className="underline">insumos</Link> (tiene receta).
          </p>
        )}
      </div>
      <div>
        <label htmlFor="producto-costo" className={labelCls}>Costo ($) {!canUseCosts && <span className="text-primary">· Pro</span>}</label>
        <Input id="producto-costo" type="number" min={0} inputMode="numeric"
          placeholder={canUseCosts ? 'Lo que te cuesta hacerlo' : 'Disponible en Pro'}
          disabled={!canUseCosts || hasRecipe} value={product.cost ?? ''}
          onFocus={e => e.target.select()} onChange={e => set({ cost: num(e.target.value, null) })} className="rounded-2xl h-12" />
        {hasRecipe && <p className="text-xs text-muted-foreground mt-1 pl-1">Sale de la receta.</p>}
      </div>
      <div>
        <label htmlFor="producto-reponer" className={labelCls}>Reponer hasta (uds.) {!canUseCosts && <span className="text-primary">· Pro</span>}</label>
        <Input id="producto-reponer" type="number" min={0} inputMode="numeric"
          placeholder={canUseCosts ? 'Stock objetivo al comprar' : 'Disponible en Pro'}
          disabled={!canUseCosts || hasRecipe} value={product.restock_target ?? ''}
          onFocus={e => e.target.select()} onChange={e => set({ restock_target: num(e.target.value, null) })} className="rounded-2xl h-12" />
      </div>
      <div>
        <span className={labelCls}>Imagen</span>
        <ImageUploader
          value={product.image_url}
          onChange={url => set({ image_url: url })}
          uploadPath={`${tenantId}/products`}
          aspectRatio="square"
          placeholder="Subir imagen del producto"
        />
      </div>
      <div className="col-span-2">
        <label htmlFor="producto-descripcion" className={labelCls}>Descripción</label>
        <textarea
          id="producto-descripcion"
          className="w-full h-20 bg-muted rounded-2xl p-4 outline-none text-sm resize-none"
          value={product.description || ''}
          onChange={e => set({ description: e.target.value })}
          placeholder="Ingredientes o descripción corta..."
        />
      </div>
    </div>
  );
}

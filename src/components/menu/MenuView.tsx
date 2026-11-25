'use client';

import { useState, useEffect } from 'react';
import type { MenuItem as MenuItemType, ModifierGroup } from '@/lib/types';
import { MenuItem } from '@/components/menu/MenuItem';
import { getMenuItems, subscribeToProducts, getProductModifierGroups } from '@/lib/data';
import { mapProductRow } from '@/lib/types';
import { useCart } from '@/hooks/useCart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MenuViewProps {
  tenantSlug: string;
  tenantId: string;
  tenantName: string;
  initialItems: MenuItemType[];
  initialGroups: Record<string, ModifierGroup[]>;
  ordersOpen?: boolean;
}

/**
 * Interactive part of the public menu. The first paint comes from the server
 * (initialItems / initialGroups); this component only keeps stock live.
 */
export function MenuView({ tenantSlug, tenantId, tenantName, initialItems, initialGroups, ordersOpen = true }: MenuViewProps) {
  const { setOrdersOpen } = useCart();
  useEffect(() => { setOrdersOpen(ordersOpen); }, [ordersOpen, setOrdersOpen]);
  const [menuItems, setMenuItems] = useState<MenuItemType[]>(initialItems);
  const [modifierGroups, setModifierGroups] = useState<Record<string, ModifierGroup[]>>(initialGroups);

  // Realtime — products table. The event already carries the changed row, so a stock
  // or price change is applied in place: no query per phone per change. Only a product
  // that wasn't on screen (new, or back in stock) triggers one grouped reload, since
  // its option groups must be fetched too.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reloadSoon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        timer = null;
        const items = await getMenuItems(tenantSlug);
        setMenuItems(items);
        if (items.length > 0) {
          setModifierGroups(await getProductModifierGroups(items.map(i => i.id)));
        }
      }, 1500);
    };

    const unsubscribe = subscribeToProducts(tenantId, ({ eventType, row }) => {
      if (!row?.id) return reloadSoon();
      if (eventType === 'DELETE') {
        setMenuItems(prev => prev.filter(i => i.id !== row.id));
        return;
      }
      const visible = row.is_available && !row.is_archived;
      setMenuItems(prev => {
        const exists = prev.some(i => i.id === row.id);
        if (!visible) return exists ? prev.filter(i => i.id !== row.id) : prev;
        if (!exists) { reloadSoon(); return prev; }
        const fresh = mapProductRow(row);
        return prev.map(i => (i.id === row.id ? { ...i, ...fresh } : i));
      });
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [tenantId, tenantSlug]);

  const categories = ['Todo el Menú', ...new Set(menuItems.map(item => item.category))];

  if (menuItems.length === 0) {
    return (
      <section className="text-center py-20">
        <span className="text-6xl block mb-4">🦍</span>
        <h1 className="font-brand text-3xl mb-2">Menú no disponible</h1>
        <p className="text-muted-foreground">Este food truck aún no tiene productos disponibles.</p>
      </section>
    );
  }

  return (
    <section>
      {/* Hero heading */}
      <div className="text-center mb-6">
        <h1 className="font-brand text-3xl sm:text-5xl lg:text-6xl uppercase leading-tight tracking-wide text-foreground">
          {tenantName || tenantSlug}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground font-body">
          Escanea, pide y disfruta 🍌
        </p>
      </div>

      {!ordersOpen && (
        <div role="status" className="mb-6 rounded-2xl border-2 border-foreground/20 bg-card px-4 py-3 text-center">
          <p className="font-bold">Los pedidos por la app están en pausa</p>
          <p className="text-sm text-muted-foreground">Puedes ver el menú y pedir directamente en caja.</p>
        </div>
      )}

      {/* Category tabs */}
      <Tabs defaultValue={categories[0]} className="w-full">
        <div className="sticky top-16 z-10 bg-background/95 backdrop-blur-sm border-b border-border/40">
          <TabsList className="flex gap-1.5 bg-transparent py-2 w-full overflow-x-auto scrollbar-none px-1 justify-start">
            {categories.map(category => (
              <TabsTrigger
                key={category}
                value={category}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs border border-border text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md transition-all duration-200 hover:border-primary/50"
              >
                {category}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {categories.map(category => (
          <TabsContent key={category} value={category}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(category === 'Todo el Menú' ? menuItems : menuItems.filter(item => item.category === category)).map((item, index) => (
                <MenuItem
                  key={item.id}
                  item={item}
                  groups={modifierGroups[item.id] || []}
                  priority={category === categories[0] && index === 0}
                  ordersOpen={ordersOpen}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

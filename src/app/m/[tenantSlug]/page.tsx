'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { MenuItem as MenuItemType, ModifierGroup } from '@/lib/types';
import { MenuItem } from '@/components/menu/MenuItem';
import { getMenuItems, subscribeToProducts, getProductModifierGroups } from '@/lib/data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from '@/lib/supabase/client';

export default function TenantMenuPage() {
  const params = useParams();
  const tenantSlug = params.tenantSlug as string;

  const [menuItems, setMenuItems] = useState<MenuItemType[]>([]);
  const [modifierGroups, setModifierGroups] = useState<Record<string, ModifierGroup[]>>({});
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Initial load
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('slug', tenantSlug)
        .single();

      if (tenant) {
        setTenantId(tenant.id);
        setTenantName(tenant.name);
      }

      const items = await getMenuItems(tenantSlug);
      setMenuItems(items);

      if (items.length > 0) {
        const groups = await getProductModifierGroups(items.map(i => i.id));
        setModifierGroups(groups);
      }

      setLoading(false);
    }
    load();
  }, [tenantSlug]);

  // Realtime subscription — syncing products table
  useEffect(() => {
    if (!tenantId) return;

    console.log(`🦍 [MENU] Subscribing to stock updates for tenant: ${tenantId}`);

    const unsubscribe = subscribeToProducts(tenantId, async () => {
      console.log('🔄 [MENU] Change detected, refreshing in 500ms...');
      // Small delay to ensure DB propagation
      setTimeout(async () => {
        const items = await getMenuItems(tenantSlug);
        setMenuItems(items);
        console.log('✅ [MENU] Stock updated live!');
      }, 500);
    });

    return unsubscribe;
  }, [tenantId, tenantSlug]);

  const categories = ['Todo el Menú', ...new Set(menuItems.map(item => item.category))];

  if (loading) {
    return (
      <section>
        <div className="flex justify-center py-20">
          <div className="text-center space-y-4">
            <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-muted-foreground">Cargando menú...</p>
          </div>
        </div>
      </section>
    );
  }

  if (menuItems.length === 0) {
    return (
      <section className="text-center py-20">
        <span className="text-6xl block mb-4">🦍</span>
        <h1 className="font-brand text-3xl mb-2">Menú no encontrado</h1>
        <p className="text-muted-foreground">Este food truck aún no ha subido su menú.</p>
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
              {(category === 'Todo el Menú' ? menuItems : menuItems.filter(item => item.category === category)).map(item => (
                <MenuItem key={item.id} item={item} groups={modifierGroups[item.id] || []} />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

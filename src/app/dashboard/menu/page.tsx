'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { getEffectivePlan } from '@/lib/data';
import { TenantGate } from '@/components/compartido/TenantGate';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCLP } from '@/lib/utils';
import {
  Package, Plus, Trash2, Edit3, Image as ImageIcon,
  Search, ChevronLeft, MoreVertical, LayoutGrid, List as ListIcon,
  AlertCircle, Save, Loader2, Store, Archive, ArchiveRestore, Settings2, X,
  HelpCircle, Zap, ChefHat
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function MenuManagementPage() {
  const { toast } = useToast();
  const { tenant: baseTenant, status, error } = useTenant();

  // Local mutable copy of tenant for the business form
  const [tenant, setTenant] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Product modal
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editProduct, setEditProduct] = useState<any>({
    name: '', price: 0, category: 'Hamburguesas', stock: 50, description: '', image_url: ''
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');

  // Modifier groups (loaded when editing an existing product)
  const [modifierGroups, setModifierGroups] = useState<any[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<'checkbox' | 'radio'>('checkbox');
  const [newGroupRequired, setNewGroupRequired] = useState(false);
  const [newOptionInputs, setNewOptionInputs] = useState<Record<string, { name: string; price: string }>>({});

  // Derive categories dynamically from products
  const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];
  const filteredProducts = selectedCategory === 'Todos' ? products : products.filter(p => p.category === selectedCategory);

  // When the tenant loads, populate local state and fetch products
  useEffect(() => {
    if (baseTenant) {
      setTenant({ ...baseTenant });
      fetchProducts(baseTenant.id);
    }
  }, [baseTenant]);

  async function fetchProducts(tenantId: string) {
    setProductsLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('category', { ascending: true });
    setProducts(data || []);
    setProductsLoading(false);
  }

  const handleUpdateTenant = async () => {
    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('tenants')
      .update({
        name: tenant.name,
        description: tenant.description || null,
        address: tenant.address || null,
        phone: tenant.phone || null,
        logo_url: tenant.logo_url || null,
        transfer_bank: tenant.transfer_bank || null,
        transfer_account_type: tenant.transfer_account_type || null,
        transfer_account_number: tenant.transfer_account_number || null,
        transfer_rut: tenant.transfer_rut || null,
        transfer_email: tenant.transfer_email || null,
      })
      .eq('id', tenant.id);

    if (updateError) {
      toast({ title: 'Error', description: updateError.message, variant: 'destructive' });
    } else {
      toast({ title: '¡Actualizado!', description: 'Los datos del negocio se guardaron.' });
    }
    setSaving(false);
  };

const PRODUCT_LIMITS: Record<string, number> = {
  gratis: 15,
  starter: 100,
  pro: 9999,
  enterprise: 99999
};

  const handleSaveProduct = async () => {
    if (!editProduct.name.trim()) return;
    setSaving(true);
    const supabase = createClient();

    if (isEditing === 'new') {
      const currentPlan = getEffectivePlan(tenant);
      const maxProducts = PRODUCT_LIMITS[currentPlan] || 15;

      if (products.length >= maxProducts) {
        toast({ 
          title: 'Límite de productos alcanzado 🛑', 
          description: `Tu plan actual (${currentPlan.toUpperCase()}) permite un máximo de ${maxProducts} productos. Sube al siguiente plan para seguir creciendo.`, 
          variant: 'destructive' 
        });
        setSaving(false);
        return;
      }

      const { data, error: insertError } = await supabase
        .from('products')
        .insert({ ...editProduct, tenant_id: tenant.id })
        .select()
        .single();

      if (insertError) {
        toast({ title: 'Error', description: insertError.message, variant: 'destructive' });
      } else {
        setProducts([...products, data]);
        setIsEditing(null);
        toast({ title: '🍌 Producto creado', description: '¡Listo para vender!' });
      }
    } else {
      const { error: updateError } = await supabase
        .from('products')
        .update(editProduct)
        .eq('id', isEditing ?? '');

      if (updateError) {
        toast({ title: 'Error', description: updateError.message, variant: 'destructive' });
      } else {
        setProducts(products.map(p => p.id === isEditing ? { ...p, ...editProduct } : p));
        setIsEditing(null);
        toast({ title: 'Producto actualizado', description: 'Los cambios se guardaron.' });
      }
    }
    setSaving(false);
  };

  const handleArchiveProduct = async (id: string, currentlyArchived: boolean) => {
    const action = currentlyArchived ? 'activar' : 'archivar';
    if (!confirm(`¿Seguro que quieres ${action} este producto?`)) return;
    
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('products')
      .update({ is_archived: !currentlyArchived })
      .eq('id', id);

    if (updateError) {
      toast({ title: 'Error', description: updateError.message, variant: 'destructive' });
    } else {
      setProducts(products.map(p => p.id === id ? { ...p, is_archived: !currentlyArchived } : p));
      toast({ 
        title: currentlyArchived ? '🚀 Producto activado' : '📁 Producto archivado',
        description: currentlyArchived ? 'Vuelve a estar visible para los clientes.' : 'Ya no aparecerá en el menú público.'
      });
    }
  };

  async function loadModifierGroups(productId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from('product_modifier_groups')
      .select('*, product_modifier_options(*)')
      .eq('product_id', productId)
      .order('sort_order');
    setModifierGroups(
      (data || []).map((g: any) => ({
        ...g,
        product_modifier_options: (g.product_modifier_options || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
      }))
    );
  }

  async function handleAddPreset(preset: { name: string; type: 'checkbox' | 'radio'; required: boolean; options: string[] }) {
    if (!isEditing || isEditing === 'new') return;
    const supabase = createClient();
    const { data: group, error: gErr } = await supabase
      .from('product_modifier_groups')
      .insert({ product_id: isEditing, tenant_id: tenant.id, name: preset.name, type: preset.type, required: preset.required, sort_order: modifierGroups.length })
      .select('*, product_modifier_options(*)')
      .single();
    if (gErr || !group) return;
    const g = group as any;
    const optionRows = preset.options.map((name, i) => ({ group_id: g.id, tenant_id: tenant.id, name, price_delta: 0, sort_order: i }));
    const { data: opts } = await supabase.from('product_modifier_options').insert(optionRows).select();
    setModifierGroups([...modifierGroups, { ...(group as any), product_modifier_options: opts || [] }]);
    toast({ title: `✅ Grupo "${preset.name}" creado`, description: 'Puedes editar o agregar más opciones.' });
  }

  async function handleAddGroup() {
    if (!newGroupName.trim() || !isEditing || isEditing === 'new') return;
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from('product_modifier_groups')
      .insert({
        product_id: isEditing,
        tenant_id: tenant.id,
        name: newGroupName.trim(),
        type: newGroupType,
        required: newGroupRequired,
        sort_order: modifierGroups.length,
      })
      .select('*, product_modifier_options(*)')
      .single();
    if (err || !data) { toast({ title: 'Error', description: err?.message, variant: 'destructive' }); return; }
    setModifierGroups([...modifierGroups, { ...(data as any), product_modifier_options: [] }]);
    setNewGroupName('');
    setNewGroupRequired(false);
  }

  async function handleDeleteGroup(groupId: string) {
    const supabase = createClient();
    await supabase.from('product_modifier_groups').delete().eq('id', groupId);
    setModifierGroups(modifierGroups.filter(g => g.id !== groupId));
  }

  async function handleAddOption(groupId: string) {
    const input = newOptionInputs[groupId];
    if (!input?.name?.trim()) return;
    const group = modifierGroups.find(g => g.id === groupId);
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from('product_modifier_options')
      .insert({
        group_id: groupId,
        tenant_id: tenant.id,
        name: input.name.trim(),
        price_delta: Number(input.price) || 0,
        sort_order: group?.product_modifier_options?.length || 0,
      })
      .select()
      .single();
    if (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); return; }
    setModifierGroups(modifierGroups.map(g =>
      g.id === groupId
        ? { ...g, product_modifier_options: [...(g.product_modifier_options || []), data] }
        : g
    ));
    setNewOptionInputs(prev => ({ ...prev, [groupId]: { name: '', price: '' } }));
  }

  async function handleDeleteOption(groupId: string, optionId: string) {
    const supabase = createClient();
    await supabase.from('product_modifier_options').delete().eq('id', optionId);
    setModifierGroups(modifierGroups.map(g =>
      g.id === groupId
        ? { ...g, product_modifier_options: (g.product_modifier_options || []).filter((o: any) => o.id !== optionId) }
        : g
    ));
  }

  // Gate: show loading/error/unauthenticated states
  if (status !== 'found' || !tenant) {
    return <TenantGate status={status} error={error} />;
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6 sm:p-10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div>
            <Link href="/dashboard" className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground mb-3 transition-colors">
              <ChevronLeft className="h-4 w-4" /> Volver al Dashboard
            </Link>
            <h1 className="font-brand text-4xl uppercase tracking-tighter">
              Mi <span className="text-primary italic">Menú</span>
            </h1>
            <p className="text-muted-foreground">Configura tu negocio y tus productos estrella.</p>
          </div>
          <Button
            onClick={() => {
              setIsEditing('new');
              setEditProduct({ name: '', price: 0, category: 'Hamburguesas', stock: 50, description: '', image_url: '' });
            }}
            className="rounded-2xl gap-2 font-bold bg-primary hover:bg-primary/90 h-12 px-6"
          >
            <Plus className="h-5 w-5" /> Nuevo Producto
          </Button>
        </div>

          {/* ── PRODUCTS ── */}
          <div className="mt-8">
            {productsLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-20">
                <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <p className="font-brand text-2xl mb-2">Sin productos aún</p>
                <p className="text-muted-foreground mb-6">Agrega tu primer producto para empezar a recibir pedidos.</p>
                <Button
                  onClick={() => {
                    setIsEditing('new');
                    setEditProduct({ name: '', price: 0, category: 'Hamburguesas', stock: 50, description: '', image_url: '' });
                  }}
                  className="rounded-2xl gap-2"
                >
                  <Plus className="h-5 w-5" /> Agregar producto
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Category Filter Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-4 custom-scrollbar">
                  {categories.map((cat: any) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`whitespace-nowrap px-5 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                        selectedCategory === cat 
                          ? 'bg-primary text-primary-foreground shadow-md scale-105' 
                          : 'bg-card text-muted-foreground hover:bg-primary/10 hover:text-primary border border-border/50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProducts.map(product => (
                    <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className="rounded-3xl border-border/50 overflow-hidden hover:shadow-xl transition-all">
                      <div className="aspect-video bg-muted relative">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                            <Package className="h-10 w-10" />
                          </div>
                        )}
                        <div className="absolute top-3 right-3 flex gap-2">
                          <Button variant="secondary" size="icon" className="rounded-full shadow-lg h-8 w-8"
                            onClick={() => {
                              setIsEditing(product.id);
                              setEditProduct({ ...product });
                              setModifierGroups([]);
                              setNewGroupName('');
                              loadModifierGroups(product.id);
                            }}>
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button 
                            variant={product.is_archived ? "default" : "destructive"} 
                            size="icon" 
                            className="rounded-full shadow-lg h-8 w-8"
                            onClick={() => handleArchiveProduct(product.id, product.is_archived)}
                          >
                            {product.is_archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <CardTitle className={`text-lg font-bold ${product.is_archived ? 'text-muted-foreground' : ''}`}>
                            {product.name}
                            {product.is_archived && <span className="ml-2 text-[10px] bg-muted px-2 py-0.5 rounded-full uppercase tracking-widest">Archivado</span>}
                          </CardTitle>
                          <span className={`${product.is_archived ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'} text-xs font-bold px-3 py-1.5 rounded-lg shrink-0`}>
                            {formatCLP(product.price || 0)}
                          </span>
                        </div>
                        <CardDescription className="line-clamp-1">{product.description || 'Sin descripción'}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{product.category}</span>
                          <span className={`font-bold ${(product.stock ?? 0) < 10 ? 'text-destructive' : 'text-green-500'}`}>
                            {product.stock ?? 0} en stock
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
            )}
          </div>
      </div>

      {/* ── Product Modal ── */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsEditing(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              className="relative w-full max-w-xl bg-card border border-border rounded-[2.5rem] p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="font-brand text-3xl uppercase mb-6">
                {isEditing === 'new' ? '🍌 Nuevo Producto' : '✍️ Editar Producto'}
              </h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="col-span-2">
                  <label className="text-xs font-bold uppercase pl-1 block mb-1">Nombre del producto</label>
                  <Input value={editProduct.name} onChange={e => setEditProduct({ ...editProduct, name: e.target.value })} className="rounded-2xl h-12" placeholder="Ej: Burger Classic" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase pl-1 block mb-1">Precio ($)</label>
                  <Input type="number" min={0} value={editProduct.price} onChange={e => setEditProduct({ ...editProduct, price: Number(e.target.value) })} className="rounded-2xl h-12" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase pl-1 block mb-1">Categoría</label>
                  <input
                    list="categories-list"
                    className="w-full h-12 bg-muted rounded-2xl px-4 outline-none text-sm font-medium border border-transparent focus:border-primary/30"
                    value={editProduct.category}
                    onChange={e => setEditProduct({...editProduct, category: e.target.value})}
                    placeholder="Escribe o elige..."
                  />
                  <datalist id="categories-list">
                    <option value="Hamburguesas" />
                    <option value="Completos" />
                    <option value="Empanadas" />
                    <option value="Chorrillanas" />
                    <option value="Papas Fritas" />
                    <option value="Bebidas" />
                    <option value="Combos" />
                    <option value="Postres" />
                    <option value="Sándwiches" />
                    <option value="Pizzas" />
                    <option value="Extras" />
                  </datalist>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase pl-1 block mb-1">Stock disponible</label>
                  <Input type="number" min={0} value={editProduct.stock} onChange={e => setEditProduct({ ...editProduct, stock: Number(e.target.value) })} className="rounded-2xl h-12" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase pl-1 block mb-1">URL Imagen</label>
                  <Input value={editProduct.image_url || ''} onChange={e => setEditProduct({ ...editProduct, image_url: e.target.value })} placeholder="https://..." className="rounded-2xl h-12" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold uppercase pl-1 block mb-1">Descripción</label>
                  <textarea
                    className="w-full h-20 bg-muted rounded-2xl p-4 outline-none text-sm resize-none"
                    value={editProduct.description || ''}
                    onChange={e => setEditProduct({ ...editProduct, description: e.target.value })}
                    placeholder="Ingredientes o descripción corta..."
                  />
                </div>
              </div>

              {/* ── Personalización del producto (Modificadores) ── */}
              {isEditing && isEditing !== 'new' && (
                <TooltipProvider>
                <div className="mt-2 border-t border-border pt-5">

                  {/* Header con tooltip */}
                  <div className="flex items-center gap-2 mb-1">
                    <ChefHat className="h-4 w-4 text-primary" />
                    <h3 className="font-bold text-sm uppercase tracking-wider">Personalización del producto</h3>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="flex items-center justify-center w-5 h-5 rounded-full bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                          <HelpCircle className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs p-4 text-sm leading-relaxed">
                        <p className="font-bold mb-2">¿Para qué sirve esto?</p>
                        <p className="text-muted-foreground mb-3">Permite que el cliente personalice su pedido. La cocina ve las elecciones en cada orden.</p>
                        <p className="font-semibold text-xs uppercase tracking-wider mb-1">Ejemplos:</p>
                        <ul className="text-muted-foreground space-y-1 text-xs">
                          <li>🧴 <b>Salsas</b> — el cliente elige Mayonesa, Ketchup, Ají (puede marcar varios)</li>
                          <li>🔥 <b>Punto de cocción</b> — elige solo uno: Jugoso, A punto o Bien cocido</li>
                          <li>🥑 <b>Sin ingredientes</b> — marca lo que no quiere: Sin palta, Sin tomate</li>
                          <li>🧀 <b>Extras con costo</b> — Queso extra (+$500), Tocino (+$800)</li>
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">Salsas, extras, ingredientes a quitar — el cliente elige al pedir.</p>

                  {/* Inicio rápido — solo si no hay grupos aún */}
                  {modifierGroups.length === 0 && (
                    <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 mb-4">
                      <div className="flex items-center gap-1.5 mb-3">
                        <Zap className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">Inicio rápido</span>
                        <span className="text-xs text-muted-foreground">— Crea un grupo con un clic:</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: '🧴 Salsas', preset: { name: 'Salsas', type: 'checkbox' as const, required: false, options: ['Mayonesa', 'Ketchup', 'Ají', 'Mostaza'] } },
                          { label: '🔥 Punto de cocción', preset: { name: 'Punto de cocción', type: 'radio' as const, required: true, options: ['Jugoso', 'A punto', 'Bien cocido'] } },
                          { label: '🥑 Sin ingredientes', preset: { name: 'Sin ingredientes', type: 'checkbox' as const, required: false, options: ['Sin palta', 'Sin tomate', 'Sin cebolla', 'Sin lechuga'] } },
                          { label: '🧀 Extras', preset: { name: 'Extras', type: 'checkbox' as const, required: false, options: ['Queso extra', 'Tocino', 'Huevo frito'] } },
                        ].map(({ label, preset }) => (
                          <button
                            key={label}
                            onClick={() => handleAddPreset(preset)}
                            className="text-xs font-medium px-3 py-1.5 rounded-xl border border-primary/30 bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Grupos existentes */}
                  <div className="space-y-3 mb-4">
                    {modifierGroups.map((group: any) => (
                      <div key={group.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm">{group.name}</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase font-bold cursor-help">
                                  {group.type === 'radio' ? '☑ Una opción' : '☑ Múltiple'}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs max-w-[200px]">
                                {group.type === 'radio'
                                  ? 'El cliente elige solo una opción (ej: Punto de cocción)'
                                  : 'El cliente puede marcar varias opciones (ej: Salsas)'}
                              </TooltipContent>
                            </Tooltip>
                            {group.required && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full uppercase font-bold cursor-help">
                                    ⚠ Requerido
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-[200px]">
                                  El cliente debe elegir al menos una opción antes de agregar al carro.
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <button onClick={() => handleDeleteGroup(group.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Opciones actuales */}
                        {(group.product_modifier_options || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {(group.product_modifier_options || []).map((opt: any) => (
                              <span key={opt.id} className="flex items-center gap-1 bg-background border border-border/60 rounded-full px-2.5 py-1 text-xs font-medium">
                                {opt.name}
                                {opt.price_delta !== 0 && (
                                  <span className="text-primary font-bold ml-0.5">
                                    {opt.price_delta > 0 ? '+' : ''}{formatCLP(opt.price_delta)}
                                  </span>
                                )}
                                <button onClick={() => handleDeleteOption(group.id, opt.id)} className="text-muted-foreground hover:text-destructive ml-0.5" aria-label="Eliminar opción">
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mb-3 italic">Sin opciones aún — agrega la primera abajo.</p>
                        )}

                        {/* Agregar opción inline */}
                        <div className="flex gap-2">
                          <Input
                            placeholder="Nombre de la opción (ej: Mayonesa)"
                            className="h-8 text-xs rounded-xl"
                            value={newOptionInputs[group.id]?.name || ''}
                            onChange={e => setNewOptionInputs(prev => ({ ...prev, [group.id]: { ...prev[group.id], name: e.target.value } }))}
                            onKeyDown={e => e.key === 'Enter' && handleAddOption(group.id)}
                          />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Input
                                placeholder="$0"
                                type="number"
                                className="h-8 text-xs rounded-xl w-20 text-center"
                                value={newOptionInputs[group.id]?.price || ''}
                                onChange={e => setNewOptionInputs(prev => ({ ...prev, [group.id]: { ...prev[group.id], price: e.target.value } }))}
                                onKeyDown={e => e.key === 'Enter' && handleAddOption(group.id)}
                              />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Costo extra en pesos ($0 = gratis)
                            </TooltipContent>
                          </Tooltip>
                          <Button size="sm" variant="outline" className="h-8 rounded-xl px-3 shrink-0" onClick={() => handleAddOption(group.id)}>
                            <Plus className="h-3 w-3 mr-1" /> Agregar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Crear nuevo grupo manual */}
                  <div className="rounded-2xl border border-dashed border-border p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {modifierGroups.length > 0 ? '+ Crear otro grupo' : 'O crea un grupo personalizado'}
                    </p>
                    <Input
                      placeholder="Nombre del grupo (ej: Salsas, Punto de cocción, Extras…)"
                      className="h-9 text-sm rounded-xl"
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                    />
                    <div className="flex gap-2 items-center flex-wrap">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <select
                            value={newGroupType}
                            onChange={e => setNewGroupType(e.target.value as 'checkbox' | 'radio')}
                            className="flex-1 min-w-[160px] h-9 bg-background border border-border rounded-xl px-3 text-sm cursor-pointer"
                          >
                            <option value="checkbox">☑ Elige varios (ej: Salsas)</option>
                            <option value="radio">◉ Elige uno (ej: Punto de cocción)</option>
                          </select>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-[220px]">
                          <b>Elige varios:</b> el cliente puede marcar más de una opción.<br />
                          <b>Elige uno:</b> el cliente debe elegir exactamente una.
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={newGroupRequired}
                              onChange={e => setNewGroupRequired(e.target.checked)}
                              className="rounded"
                            />
                            Obligatorio
                          </label>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-[200px]">
                          Si está marcado, el cliente no podrá agregar al carro sin elegir esta opción.
                        </TooltipContent>
                      </Tooltip>
                      <Button size="sm" className="h-9 rounded-xl gap-1.5" onClick={handleAddGroup} disabled={!newGroupName.trim()}>
                        <Plus className="h-3.5 w-3.5" /> Crear grupo
                      </Button>
                    </div>
                  </div>

                </div>
                </TooltipProvider>
              )}

              <div className="flex gap-3 mt-4">
                <Button variant="ghost" onClick={() => setIsEditing(null)} className="flex-1 h-14 rounded-2xl font-bold">Cancelar</Button>
                <Button onClick={handleSaveProduct} disabled={saving || !editProduct.name.trim()} className="flex-[2] h-14 rounded-2xl font-bold gap-2 active:scale-95">
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  Guardar Producto
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

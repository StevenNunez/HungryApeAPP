'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { TenantGate } from '@/components/compartido/TenantGate';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCLP } from '@/lib/utils';
import {
  Package, Plus, Trash2, Edit3, Image as ImageIcon,
  Search, ChevronLeft, MoreVertical, LayoutGrid, List as ListIcon,
  AlertCircle, Save, Loader2, Store, Archive, ArchiveRestore
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

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
  gratis: 30,
  starter: 100,
  pro: 9999,
  enterprise: 99999
};

  const handleSaveProduct = async () => {
    if (!editProduct.name.trim()) return;
    setSaving(true);
    const supabase = createClient();

    if (isEditing === 'new') {
      const currentPlan = tenant?.plan_id || 'gratis';
      const maxProducts = PRODUCT_LIMITS[currentPlan] || 30;

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
                            onClick={() => { setIsEditing(product.id); setEditProduct({ ...product }); }}>
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

              <div className="flex gap-3">
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

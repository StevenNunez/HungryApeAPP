'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchProductPrivate, withPrivate, splitPrivate, saveProductPrivate } from '@/lib/product-private';
import { useTenant } from '@/hooks/useTenant';
import Image from 'next/image';
import { getEffectivePlan } from '@/lib/data';
import { isProPlan, productLimit, PLAN_LABEL } from '@/lib/plans';
import { TenantGate } from '@/components/compartido/TenantGate';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCLP } from '@/lib/utils';
import { Package, Plus, Edit3, ChevronLeft, Save, Loader2, Archive, ArchiveRestore, Camera, ChevronDown, ExternalLink, Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { mensajeParaPersona } from '@/lib/errores';
import { ModifierGroupsEditor } from '@/components/menu-admin/ModifierGroupsEditor';
import { ProductForm } from '@/components/menu-admin/ProductForm';

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

  // Confirm archive dialog
  const [confirmArchive, setConfirmArchive] = useState<{ id: string; name: string; currentlyArchived: boolean } | null>(null);
  // Photo tips panel
  const [tipsOpen, setTipsOpen] = useState(false);


  // Cost & restock fields (margin reports, restock estimates) are a Pro feature
  const canUseCosts = tenant ? isProPlan(getEffectivePlan(tenant)) : false;

  // Derive categories dynamically from products
  const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];
  const filteredProducts = selectedCategory === 'Todos' ? products : products.filter(p => p.category === selectedCategory);

  // When the tenant loads, populate local state and fetch products
  useEffect(() => {
    if (baseTenant) {
      setTenant({ ...baseTenant });
      fetchProducts(baseTenant.id);
    }
    // fetchProducts is a plain function declared below; it only depends on the id passed in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseTenant]);

  async function fetchProducts(tenantId: string) {
    setProductsLoading(true);
    const supabase = createClient();
    const [{ data, error }, priv] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('category', { ascending: true }),
      fetchProductPrivate(tenantId).catch(() => ({})),
    ]);
    if (error) {
      toast({ title: 'No pudimos cargar tus productos', description: 'Revisa tu conexión y recarga la página.', variant: 'destructive' });
    }
    setProducts(withPrivate(data || [], priv));
    setProductsLoading(false);
  }




  const handleSaveProduct = async () => {
    if (!editProduct.name.trim()) return;
    setSaving(true);
    const supabase = createClient();

    if (isEditing === 'new') {
      const currentPlan = getEffectivePlan(tenant);
      const maxProducts = productLimit(currentPlan);
      const activeProducts = products.filter(p => !p.is_archived).length;

      if (maxProducts !== null && activeProducts >= maxProducts) {
        toast({
          title: 'Llegaste al límite de productos',
          description: `Tu ${PLAN_LABEL[currentPlan as keyof typeof PLAN_LABEL] ?? 'plan'} permite hasta ${maxProducts} productos activos. Archiva alguno o sube de plan para agregar más.`,
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }

      const { publicFields, privateFields } = splitPrivate(editProduct);
      const { data, error: insertError } = await supabase
        .from('products')
        .insert({ ...(publicFields as any), tenant_id: tenant.id })
        .select()
        .single();

      if (insertError) {
        toast({ title: 'No se pudo crear el producto', description: 'Revisa los datos e inténtalo de nuevo.', variant: 'destructive' });
      } else {
        if (privateFields.cost !== null || privateFields.restock_target !== null) {
          await saveProductPrivate(tenant.id, data.id, privateFields).catch(() =>
            toast({ title: 'El producto se creó, pero no su costo', description: 'Edítalo para volver a ingresarlo.', variant: 'destructive' }),
          );
        }
        setProducts([...products, { ...data, ...privateFields }]);
        setIsEditing(null);
        toast({ title: '🍌 Producto creado', description: '¡Listo para vender!' });
      }
    } else {
      const { publicFields, privateFields } = splitPrivate(editProduct);
      const { error: updateError } = await supabase
        .from('products')
        .update(publicFields as any)
        .eq('id', isEditing ?? '');
      const privateError = !updateError && canUseCosts
        ? await saveProductPrivate(tenant.id, isEditing ?? '', privateFields).then(() => null, (e: Error) => e)
        : null;

      // Products with a recipe take their stock from supplies: recompute after saving
      if (!updateError && canUseCosts) {
        await (supabase as any).rpc('refresh_my_recipe_stock').then(() => undefined, () => undefined);
      }

      if (updateError || privateError) {
        toast({ title: 'No se pudieron guardar los cambios', description: 'Revisa tu conexión e inténtalo de nuevo.', variant: 'destructive' });
      } else {
        setProducts(products.map(p => p.id === isEditing ? { ...p, ...editProduct } : p));
        setIsEditing(null);
        toast({ title: 'Producto actualizado', description: 'Los cambios se guardaron.' });
      }
    }
    setSaving(false);
  };

  const handleArchiveProduct = async (id: string, currentlyArchived: boolean) => {
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('products')
      .update({ is_archived: !currentlyArchived })
      .eq('id', id);

    if (updateError) {
      toast({ title: 'No se pudo completar', description: mensajeParaPersona(updateError, 'menú'), variant: 'destructive' });
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

          {/* ── PHOTO TIPS ── */}
          <div className="mb-6">
            <button
              onClick={() => setTipsOpen(v => !v)}
              className="flex items-center gap-2 w-full text-left px-4 py-3 rounded-2xl bg-card border border-border/60 hover:border-primary/30 transition-all group"
            >
              <div className="p-1.5 bg-primary/10 rounded-xl group-hover:bg-primary/20 transition-colors">
                <Camera className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-bold flex-1">Tips para fotos de productos</span>
              <span className="text-xs text-muted-foreground mr-2 hidden sm:block">Tamaño · Formato · Calidad</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${tipsOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {tipsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 px-4 py-5 rounded-2xl bg-card border border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Specs */}
                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Especificaciones</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tamaño ideal</span>
                          <span className="font-semibold">800 × 800 px</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Formato</span>
                          <span className="font-semibold">JPG · PNG · WEBP</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Peso máx. subida</span>
                          <span className="font-semibold">10 MB</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Peso tras comprimir</span>
                          <span className="font-semibold text-green-800">~150–300 KB</span>
                        </div>
                      </div>
                    </div>

                    {/* Shoot tips */}
                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Para mejores fotos</p>
                      <ul className="space-y-2 text-sm">
                        {[
                          'Usa luz natural lateral, no flash',
                          'Fondo neutro (blanco, madera, pizarra)',
                          'Centra el plato y llena el encuadre',
                          'Limpia los bordes antes de fotografiar',
                          'Toma desde arriba (45° o cenital)',
                        ].map(tip => (
                          <li key={tip} className="flex items-start gap-2">
                            <Lightbulb className="h-3.5 w-3.5 text-amber-800 mt-0.5 shrink-0" />
                            <span className="text-muted-foreground">{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Links */}
                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recursos gratuitos</p>
                      <div className="space-y-2">
                        {[
                          { label: 'Guía de fotografía de comida', href: 'https://www.canva.com/learn/food-photography/' },
                          { label: 'Redimensionar gratis (Squoosh)', href: 'https://squoosh.app' },
                          { label: 'Fondos de comida gratis (Unsplash)', href: 'https://unsplash.com/s/photos/food' },
                          { label: 'Remover fondo gratis (Remove.bg)', href: 'https://www.remove.bg' },
                        ].map(link => (
                          <a
                            key={link.href}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-primary hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            {link.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
                          <Image src={product.image_url} alt={product.name} fill sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" className="object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                            <Package className="h-10 w-10" />
                          </div>
                        )}
                        <div className="absolute top-3 right-3 flex gap-2">
                          <Button variant="secondary" size="icon" className="rounded-full shadow-lg h-11 w-11"
                            aria-label={`Editar ${product.name}`}
                            onClick={() => {
                              setIsEditing(product.id);
                              setEditProduct({ ...product });
                            }}>
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button 
                            variant={product.is_archived ? "default" : "destructive"} 
                            size="icon" 
                            className="rounded-full shadow-lg h-8 w-8"
                            onClick={() => setConfirmArchive({ id: product.id, name: product.name, currentlyArchived: product.is_archived })}
                          >
                            {product.is_archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <CardTitle className={`text-lg font-bold ${product.is_archived ? 'text-muted-foreground' : ''}`}>
                            {product.name}
                            {product.is_archived && <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full uppercase tracking-widest">Archivado</span>}
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
                          <span className={`font-bold ${(product.stock ?? 0) < 10 ? 'text-destructive' : 'text-green-800'}`}>
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
              className="relative w-full max-w-xl bg-card border border-border rounded-panel p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="font-brand text-3xl uppercase mb-6">
                {isEditing === 'new' ? '🍌 Nuevo Producto' : '✍️ Editar Producto'}
              </h2>

              <ProductForm
                product={editProduct}
                onChange={setEditProduct}
                tenantId={tenant.id}
                productId={isEditing === 'new' ? null : isEditing}
                canUseCosts={canUseCosts}
              />

              {/* ── Personalización del producto (opciones que elige el cliente) ── */}
              {isEditing && isEditing !== 'new' && (
                <ModifierGroupsEditor key={isEditing} tenantId={tenant.id} productId={isEditing} />
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

      {/* ── Confirm archive/activate modal ─────────────────────────────── */}
      <AnimatePresence>
        {confirmArchive && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmArchive(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="relative w-full max-w-sm bg-card border border-border rounded-panel shadow-2xl p-8 flex flex-col items-center text-center gap-5"
            >
              <div className={`p-4 rounded-3xl ${confirmArchive.currentlyArchived ? 'bg-green-500/10' : 'bg-amber-500/10'}`}>
                {confirmArchive.currentlyArchived
                  ? <ArchiveRestore className="h-8 w-8 text-green-800" />
                  : <Archive className="h-8 w-8 text-amber-800" />
                }
              </div>
              <div>
                <h3 className="font-brand text-xl uppercase tracking-wide mb-1">
                  {confirmArchive.currentlyArchived ? 'Activar producto' : 'Archivar producto'}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {confirmArchive.currentlyArchived
                    ? <>¿Quieres volver a mostrar <span className="text-foreground font-semibold">“{confirmArchive.name}”</span> en el menú?</>
                    : <>¿Quieres ocultar <span className="text-foreground font-semibold">“{confirmArchive.name}”</span> del menú? Podrás reactivarlo cuando quieras.</>
                  }
                </p>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Button
                  variant="ghost"
                  onClick={() => setConfirmArchive(null)}
                  className="flex-1 h-12 rounded-2xl font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    handleArchiveProduct(confirmArchive.id, confirmArchive.currentlyArchived);
                    setConfirmArchive(null);
                  }}
                  className={`flex-1 h-12 rounded-2xl font-bold ${confirmArchive.currentlyArchived
                    ? 'bg-green-500 hover:bg-green-600 text-white'
                    : 'bg-amber-500 hover:bg-amber-600 text-white'
                  }`}
                >
                  {confirmArchive.currentlyArchived ? 'Sí, activar' : 'Sí, archivar'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

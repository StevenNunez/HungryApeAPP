'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Store, Package, ArrowRight, CheckCircle } from 'lucide-react';

type Step = 'name' | 'product' | 'done';

const CATEGORIES = ['Hamburguesas', 'Hot Dogs', 'Tacos', 'Pizzas', 'Bebidas', 'Acompañamientos', 'Postres', 'General'];

export default function SetupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('name');
  const [loading, setLoading] = useState(false);

  // Step 1 — Business name
  const [businessName, setBusinessName] = useState('');
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Step 2 — First product
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productCategory, setProductCategory] = useState('General');

  // Pre-fill business name from auth user metadata
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/login'); return; }
      const meta = user.user_metadata;
      // Works for email signup (business_name) and Google OAuth (full_name / name)
      const name = meta?.business_name || meta?.full_name || meta?.name || '';
      if (name) setBusinessName(name);
    });
  }, [router]);

  // ── Step 1: Create the tenant ───────────────────────────────────────────────
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) return;
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }

    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 30) + '-' + Math.random().toString(36).slice(2, 6);

    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: tenant, error } = await (supabase.from('tenants') as any).insert({
      slug,
      name: businessName,
      owner_id: user.id,
      subscription_status: 'trial',
      trial_ends_at: trialEndsAt,
    }).select('id').single();

    if (error) {
      toast({ title: 'Error al crear negocio', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    setTenantId(tenant.id);

    // Fire welcome email (non-blocking)
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (!u?.email) return;
      fetch('/api/email/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: u.email, businessName, planId: 'gratis' }),
      }).catch(() => {});
    });

    setLoading(false);
    setStep('product');
  };

  // ── Step 2: Add first product ───────────────────────────────────────────────
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !productName.trim() || !productPrice) return;
    setLoading(true);

    const price = parseFloat(productPrice);
    if (isNaN(price) || price <= 0) {
      toast({ title: 'Precio inválido', variant: 'destructive' });
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error } = await (supabase.from('products') as any).insert({
      tenant_id: tenantId,
      name: productName,
      price,
      category: productCategory,
      description: '',
      is_available: true,
      stock: 99,
    });

    if (error) {
      toast({ title: 'Error al agregar producto', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    setStep('done');
    setLoading(false);
    setTimeout(() => router.replace('/dashboard'), 1500);
  };

  const handleSkipProduct = () => {
    setStep('done');
    setTimeout(() => router.replace('/dashboard'), 1200);
  };

  // ── Step indicator ──────────────────────────────────────────────────────────
  const steps = [
    { id: 'name', label: 'Tu negocio', icon: Store },
    { id: 'product', label: 'Primer producto', icon: Package },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-accent/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="relative inline-flex items-baseline mb-2">
            <span aria-hidden="true" className="absolute inset-0 -inset-x-4 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] bg-accent/90 -z-0" style={{ transform: 'rotate(-1.5deg) skewX(-2deg)' }} />
            <span className="relative z-10 font-brand text-2xl tracking-wider text-foreground" style={{ lineHeight: 1 }}>HUNGRY</span>
            <span className="relative z-10 text-xl mx-1" style={{ lineHeight: 1 }}>🍌</span>
            <span className="relative z-10 font-brand text-2xl tracking-wider text-foreground" style={{ lineHeight: 1 }}>APE</span>
          </div>
        </div>

        {/* Step progress — hide on done */}
        {step !== 'done' && (
          <div className="flex items-center justify-center gap-3 mb-8">
            {steps.map((s, i) => {
              const stepOrder: Step[] = ['name', 'product', 'done'];
              const isActive = s.id === (step as string);
              const isDone = stepOrder.indexOf(s.id as Step) < stepOrder.indexOf(step);
              const Icon = s.icon;
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <div className={`flex flex-col items-center gap-1`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isDone ? 'bg-green-500/20 text-green-500 border border-green-500/40' :
                      isActive ? 'bg-primary/20 text-primary border border-primary/40' :
                      'bg-muted text-muted-foreground border border-border'
                    }`}>
                      {isDone ? <CheckCircle className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <span className={`text-xs font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`w-12 h-px mb-5 transition-colors ${isDone ? 'bg-green-500/40' : 'bg-border'}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Step 1: Business name ──────────────────────────────────────── */}
        {step === 'name' && (
          <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-2xl">
            <div className="text-center mb-6">
              <div className="inline-flex p-4 bg-primary/10 rounded-3xl mb-3">
                <Store className="h-10 w-10 text-primary" />
              </div>
              <h1 className="font-brand text-2xl uppercase tracking-wide">Tu Food Truck</h1>
              <p className="text-muted-foreground text-sm mt-1">¿Cómo se llama tu negocio?</p>
            </div>

            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div>
                <label className="text-sm font-bold uppercase tracking-tighter pl-1 block mb-2">
                  Nombre del local
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder="Ej: Gorilla Burgers"
                  className="w-full h-14 bg-muted rounded-2xl px-5 outline-none focus:ring-2 ring-primary/50 transition-all text-foreground text-base"
                />
                <p className="text-xs text-muted-foreground mt-2 pl-1">Este nombre verán tus clientes en el menú y QR.</p>
              </div>

              <button
                type="submit"
                disabled={loading || !businessName.trim()}
                className="w-full h-14 bg-primary text-primary-foreground font-bold text-base rounded-2xl hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Continuar <ArrowRight className="h-5 w-5" /></>}
              </button>
            </form>
          </div>
        )}

        {/* ── Step 2: First product ──────────────────────────────────────── */}
        {step === 'product' && (
          <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-2xl">
            <div className="text-center mb-6">
              <div className="inline-flex p-4 bg-green-500/10 rounded-3xl mb-3">
                <Package className="h-10 w-10 text-green-500" />
              </div>
              <h1 className="font-brand text-2xl uppercase tracking-wide">Primer Producto</h1>
              <p className="text-muted-foreground text-sm mt-1">Agrega tu primer ítem al menú. Puedes agregar más después.</p>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-4">
              <div>
                <label className="text-sm font-bold uppercase tracking-tighter pl-1 block mb-2">Nombre del producto</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                  placeholder="Ej: Hamburguesa Clásica"
                  className="w-full h-12 bg-muted rounded-xl px-4 outline-none focus:ring-2 ring-primary/50 transition-all text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-bold uppercase tracking-tighter pl-1 block mb-2">Precio ($)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="1"
                    value={productPrice}
                    onChange={e => setProductPrice(e.target.value)}
                    placeholder="5990"
                    className="w-full h-12 bg-muted rounded-xl px-4 outline-none focus:ring-2 ring-primary/50 transition-all text-foreground"
                  />
                </div>
                <div>
                  <label className="text-sm font-bold uppercase tracking-tighter pl-1 block mb-2">Categoría</label>
                  <select
                    value={productCategory}
                    onChange={e => setProductCategory(e.target.value)}
                    className="w-full h-12 bg-muted rounded-xl px-4 outline-none focus:ring-2 ring-primary/50 transition-all text-foreground"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !productName.trim() || !productPrice}
                className="w-full h-14 bg-primary text-primary-foreground font-bold text-base rounded-2xl hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Agregar al menú <ArrowRight className="h-5 w-5" /></>}
              </button>

              <button
                type="button"
                onClick={handleSkipProduct}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                Saltar por ahora →
              </button>
            </form>
          </div>
        )}

        {/* ── Done ────────────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="bg-card border border-border rounded-[2.5rem] p-10 shadow-2xl text-center">
            <div className="inline-flex p-5 bg-green-500/10 rounded-full mb-4">
              <CheckCircle className="h-14 w-14 text-green-500" />
            </div>
            <h1 className="font-brand text-3xl uppercase tracking-wide mb-2">¡Listo!</h1>
            <p className="text-muted-foreground">Tu food truck digital está configurado. Redirigiendo...</p>
            <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto mt-5" />
          </div>
        )}
      </div>
    </div>
  );
}

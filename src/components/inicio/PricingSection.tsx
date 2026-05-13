'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, X, Store, Mail, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

const plans = [
  {
    id: 'basico',
    name: 'Básico',
    priceMonthly: '$4.990',
    priceAnnual: '$3.992',
    period: '/mes',
    cancelText: '14 días gratis · Sin tarjeta',
    description: 'Todo lo que necesitas para digitalizar tu food truck. Empieza gratis hoy.',
    badge: '14 días gratis 🎉',
    features: [
      'Menú digital ilimitado',
      'Código QR personalizado',
      'Pedidos personalizados (salsas, extras, punto de cocción)',
      'Cocina en tiempo real',
      'Hasta 40 pedidos/día',
      'Pagos: Efectivo y Transferencia',
      'Código de retiro seguro',
    ],
    cta: 'Empezar 14 días gratis',
    popular: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    priceMonthly: '$14.990',
    priceAnnual: '$11.990',
    period: '/mes',
    cancelText: 'Cancela cuando quieras',
    description: 'Para el food truck que ya vende y necesita control total de su operación.',
    badge: null,
    features: [
      'Todo lo de Básico, sin límite de pedidos',
      'Hasta 100 productos en el menú',
      'Caja: inicio, cierre y arqueo automático',
      'Egresos de caja (proveedores, gastos)',
      'Inventario en vivo con alertas de stock',
      'Analíticas de ventas por método de pago',
    ],
    cta: 'Empezar Starter',
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: '$29.990',
    priceAnnual: '$23.990',
    period: '/mes',
    cancelText: 'Cancela cuando quieras',
    description: 'Cobra automático y optimiza cada detalle de tu operación.',
    badge: null,
    features: [
      'Todo lo de Starter',
      'Pagos online integrados (Tarjeta / Débito / Apps)',
      'Notificaciones al cliente por WhatsApp',
      'Costo por producto y análisis de margen',
      'Reportes avanzados exportables (PDF / Excel)',
      'Tiempos de preparación por producto',
    ],
    cta: 'Subir a Pro',
    popular: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: '$79.990',
    priceAnnual: '$63.990',
    period: '/mes',
    cancelText: 'Cancela cuando quieras',
    description: 'Control total para cadenas, franquicias y operaciones con múltiples puntos.',
    badge: null,
    features: [
      'Todo lo de Pro',
      'Multi-sucursales desde un solo dashboard',
      'Múltiples cajeros y administradores',
      'Control de insumos y recetas con descuento automático',
      'Integración con POS externo',
      'Alertas de reposición con costo estimado',
    ],
    cta: 'Contactar Ventas',
    popular: false,
  },
];

export function PricingSection() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [isAnnual, setIsAnnual] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function checkUser() {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    }
    checkUser();
  }, []);

  // Resolve tenantId for a logged-in user before checkout
  async function getTenantId(userId: string): Promise<string | null> {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('owner_id', userId)
      .single();
    return data?.id ?? null;
  }

  const handleOpenModal = async (plan: any) => {
    if (plan.id === 'basico') {
      if (user) {
        router.push('/dashboard');
      } else {
        router.push('/login?mode=signup');
      }
      return;
    }
    if (plan.id === 'enterprise') {
      window.location.href = 'mailto:ventas@hungryape.com?subject=Interés%20en%20el%20Plan%20Enterprise';
      return;
    }

    if (user) {
      // Direct checkout for logged-in users
      handleDirectCheckout(plan);
    } else {
      setSelectedPlan(plan);
    }
  };

  const handleDirectCheckout = async (plan: any) => {
    setLoading(true);
    try {
      const tenantId = await getTenantId(user.id);
      const res = await fetch('/api/mercadopago/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          userId: user.id,
          tenantId,
          email: user.email || 'usuario@hungryape.com',
          isPreRegistration: false,
          isAnnual,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al conectar con pagos');
      
      const checkoutUrl = data.sandboxInitPoint || data.initPoint;
      if (checkoutUrl) window.location.href = checkoutUrl;
      else throw new Error('No se generó el link de pago');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create Mercado Pago preference
      // Note: Since they aren't registered yet, we'll store businessName/email in external_reference
      const res = await fetch('/api/mercadopago/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlan.id,
          email,
          businessName, // Sent to backend to store in reference
          isPreRegistration: true,
          isAnnual
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al conectar con Mercado Pago');

      const checkoutUrl = data.sandboxInitPoint || data.initPoint;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        throw new Error('No se generó el link de pago');
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="py-20 relative bg-background" id="pricing">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-brand text-4xl sm:text-6xl tracking-wide uppercase"
          >
            Planes <span className="text-primary italic">Simples</span>
          </motion.h2>
          <p className="mt-4 text-muted-foreground text-lg">Cero comisiones por pedido. Solo un monto fijo mensual.</p>
          
          <div className="mt-10 flex items-center justify-center gap-4">
            <span className={`text-sm font-bold ${!isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>Mensual</span>
            <button 
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative inline-flex h-8 w-14 items-center rounded-full bg-primary/20 transition-colors focus:outline-none"
            >
              <div className={`inline-block h-6 w-6 transform rounded-full bg-primary transition-transform ${isAnnual ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>Anual</span>
              <span className="bg-green-500/20 text-green-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">Ahorras 20%</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {plans.map((plan, idx) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className={`relative flex flex-col p-8 rounded-[2rem] border-2 transition-all duration-300 ${plan.popular
                ? 'bg-card border-primary shadow-[0_0_40px_-10px_rgba(220,38,38,0.3)] scale-105 z-10'
                : 'bg-card/50 border-border hover:border-primary/30'
                }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] sm:text-xs font-bold px-6 py-1.5 rounded-full shadow-lg uppercase tracking-wider flex items-center gap-2">
                  <span>MÁS POPULAR</span>
                  <span className="text-base">🦍</span>
                </div>
              )}
              {!plan.popular && (plan as any).badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[10px] sm:text-xs font-bold px-5 py-1.5 rounded-full shadow-lg uppercase tracking-wider whitespace-nowrap">
                  {(plan as any).badge}
                </div>
              )}

              <div className="mb-8">
                <h3 className="font-brand text-2xl tracking-widest uppercase mb-2">{plan.name}</h3>
                <p className="text-sm text-muted-foreground min-h-[40px]">{plan.description}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1 transition-all duration-300">
                  <span className="text-5xl font-bold">{isAnnual ? plan.priceAnnual : plan.priceMonthly}</span>
                  <span className="text-muted-foreground font-medium">{plan.period}</span>
                </div>
                <div className="mt-2 text-[11px] font-bold text-muted-foreground tracking-widest uppercase">
                  {plan.cancelText}
                </div>
              </div>

              <ul className="space-y-4 mb-10 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex gap-3 text-sm font-medium items-start">
                    <div className="mt-1 bg-primary/10 rounded-full p-0.5">
                      <Check className="h-3 w-3 text-primary" strokeWidth={3} />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleOpenModal(plan)}
                className={`w-full py-5 rounded-2xl font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${plan.popular
                  ? 'bg-primary text-primary-foreground shadow-xl ha-glow-red hover:bg-primary/90'
                  : 'bg-muted text-foreground hover:bg-muted/80'
                  }`}
              >
                {plan.cta}
                <ArrowRight className="h-5 w-5" />
              </button>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Modern Modal Pre-Checkout */}
      <AnimatePresence>
        {selectedPlan && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPlan(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-card border border-border rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <button
                onClick={() => setSelectedPlan(null)}
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="p-8 pt-10">
                <div className="text-center mb-8">
                  <div className="inline-flex p-4 bg-primary/10 rounded-3xl mb-4">
                    <Store className="h-10 w-10 text-primary" />
                  </div>
                  <h3 className="font-brand text-3xl uppercase tracking-wider mb-2">Casi listo 🍌</h3>
                  <p className="text-muted-foreground">Tu plan <span className="text-foreground font-bold">{selectedPlan.name}</span> está a un paso.</p>
                </div>

                <form onSubmit={handleCheckout} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold pl-1 uppercase tracking-tighter">Nombre de tu Food Truck</label>
                    <div className="relative">
                      <Store className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <input
                        required
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Ej: Gorilla Burgers"
                        className="w-full bg-muted border-0 h-14 pl-12 pr-4 rounded-2xl focus:ring-2 ring-primary/50 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold pl-1 uppercase tracking-tighter">Tu Email de contacto</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tu@email.com"
                        className="w-full bg-muted border-0 h-14 pl-12 pr-4 rounded-2xl focus:ring-2 ring-primary/50 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <button
                    disabled={loading}
                    className="w-full h-16 bg-primary text-primary-foreground font-bold text-xl rounded-2xl shadow-xl hover:shadow-primary/20 transition-all flex items-center justify-center gap-2 mt-6 active:scale-95 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : 'PAGAR CON MERCADO PAGO'}
                  </button>

                  <p className="text-[10px] text-center text-muted-foreground mt-4 px-6">
                    Al proceder, serás redirigido a Mercado Pago para completar tu suscripción de forma segura.
                  </p>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}

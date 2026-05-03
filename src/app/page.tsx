import Link from 'next/link';
import { QrCode, ChefHat, Smartphone, Shield, BarChart3, Zap, ArrowRight, Boxes, Download } from 'lucide-react';
import { PricingSection } from '@/components/inicio/PricingSection';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const features = [
  {
    icon: QrCode,
    title: 'Menú QR con Categorías',
    description: 'Genera tu QR único. El cliente escanea, ve todo el menú o filtra por categoría (Completos, Hamburguesas, Bebidas…) y pide al instante.',
  },
  {
    icon: ChefHat,
    title: 'Cocina en Tiempo Real',
    description: 'Los pedidos aparecen en tu pantalla de cocina al instante. Marca como "En preparación", "Listo" y el cliente lo ve en su teléfono.',
  },
  {
    icon: Shield,
    title: 'Retiro 100% Seguro',
    description: 'Cada pedido genera un código único. Tu cocina lo exige al entregar. Nadie se lleva comida sin pagar.',
  },
  {
    icon: Boxes,
    title: 'Inventario Vivo',
    description: 'Panel de inventario con alertas de stock bajo y sin stock. Ajusta unidades en un clic. El stock se descuenta solo al recibir cada pedido.',
  },
  {
    icon: BarChart3,
    title: 'Analíticas de Ventas',
    description: 'Ve tus ventas brutas, pedidos completados, producto estrella y métodos de pago preferidos. Todo en un dashboard claro.',
  },
  {
    icon: Download,
    title: 'Instalable como App',
    description: 'Hungry Ape es una PWA. Tus clientes pueden instalarla desde el navegador sin ir al App Store. Ícono en pantalla, funciona offline.',
  },
];


export default async function LandingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ═══ Navigation ═══ */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-0 group select-none">
            <div className="relative flex items-baseline">
              <span
                aria-hidden="true"
                className="absolute inset-0 -inset-x-3 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] bg-accent/90 -z-0"
                style={{ transform: 'rotate(-1.5deg) skewX(-2deg)' }}
              />
              <span className="relative z-10 font-brand text-lg tracking-wider text-foreground" style={{ lineHeight: 1 }}>HUNGRY</span>
              <span className="relative z-10 text-base mx-0.5 group-hover:rotate-12 transition-transform" style={{ lineHeight: 1 }}>🍌</span>
              <span className="relative z-10 font-brand text-lg tracking-wider text-foreground" style={{ lineHeight: 1 }}>APE</span>
            </div>
          </Link>

          {/* CTA */}
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/dashboard"
                className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all active:scale-95 shadow-md flex items-center gap-2"
              >
                Mi Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Iniciar Sesión
                </Link>
                <Link
                  href="#pricing"
                  className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all active:scale-95 shadow-md"
                >
                  Registrarse
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ═══ Hero ═══ */}
      <section className="relative overflow-hidden py-20 sm:py-32">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-accent/20 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        </div>

        <div className="container mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-accent/20 text-accent-foreground px-4 py-1.5 rounded-full text-sm font-medium mb-8 border border-accent/30">
            <Zap className="h-4 w-4" />
            La app para Food Trucks hecha en Chile 🇨🇱
          </div>

          <h1 className="font-brand text-5xl sm:text-7xl lg:text-8xl tracking-wide leading-tight">
            TU FOOD TRUCK
            <br />
            <span className="relative inline-block">
              <span
                aria-hidden="true"
                className="absolute inset-0 -inset-x-6 bg-accent/90 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] -z-10"
                style={{ transform: 'rotate(-1deg) skewX(-2deg)' }}
              />
              <span className="relative">DIGITAL</span>
            </span>
            {' '}EN MINUTOS
          </h1>

          <p className="mt-8 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Registra tu negocio, sube tu menú, genera un código QR y recibe pedidos.
            <br className="hidden sm:block" />
            <strong className="text-foreground">Sin apps. Sin complicaciones. Sin comisiones por pedido.</strong>
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={user ? "/dashboard" : "#pricing"}
              className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-8 py-4 rounded-2xl text-lg font-bold hover:bg-primary/90 transition-all active:scale-95 shadow-xl ha-glow-red"
            >
              {user ? 'Ir a mi Food Truck' : 'Crear Mi Food Truck'}
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center justify-center gap-2 bg-card border border-border text-foreground px-8 py-4 rounded-2xl text-lg font-semibold hover:border-primary/50 transition-all"
            >
              🦍 Ver Demo en Vivo
            </Link>
          </div>

          {/* Value props */}
          <div className="mt-16 flex flex-wrap justify-center gap-8 sm:gap-14">
            {[
              { value: '$0', label: 'Para empezar' },
              { value: '0%', label: 'Comisión por pedido' },
              { value: '∞', label: 'Pedidos en Starter' },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <p className="font-brand text-3xl sm:text-4xl text-primary">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Features ═══ */}
      <section className="py-20 bg-card/50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-brand text-3xl sm:text-5xl tracking-wide">
              TODO LO QUE{' '}
              <span className="relative inline-block">
                <span aria-hidden="true" className="absolute inset-0 -inset-x-3 bg-accent/90 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] -z-10" style={{ transform: 'rotate(-1deg)' }} />
                <span className="relative">NECESITAS</span>
              </span>
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              Desde el menú hasta la cocina, todo conectado en tiempo real.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(feature => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group bg-card rounded-2xl p-6 border border-border hover:border-primary/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ How it works ═══ */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-brand text-3xl sm:text-5xl tracking-wide">
              CÓMO{' '}
              <span className="relative inline-block">
                <span aria-hidden="true" className="absolute inset-0 -inset-x-3 bg-accent/90 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] -z-10" style={{ transform: 'rotate(1deg)' }} />
                <span className="relative">FUNCIONA</span>
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {[
              { step: '1', emoji: '📝', title: 'Registra tu negocio', desc: 'Crea tu cuenta gratis, carga tu menú con categorías, precios y stock inicial.' },
              { step: '2', emoji: '📱', title: 'Genera tu QR', desc: 'Imprime el código QR y ponlo en tu local. El cliente escanea y ve todo tu menú al instante.' },
              { step: '3', emoji: '🍔', title: 'Recibe pedidos', desc: 'Los pedidos llegan a tu cocina en tiempo real. Cambia el estado y el cliente lo ve en su pantalla.' },
              { step: '4', emoji: '📊', title: 'Controla tu negocio', desc: 'Revisá tu inventario vivo, alertas de stock y analíticas de ventas desde el dashboard.' },
            ].map(item => (
              <div key={item.step} className="text-center">
                <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-6">
                  <span className="text-4xl">{item.emoji}</span>
                  <span className="absolute -top-2 -right-2 w-7 h-7 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center shadow-lg">
                    {item.step}
                  </span>
                </div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Pricing — Mercado Pago ═══ */}
      <PricingSection />

      {/* ═══ CTA final ═══ */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <h2 className="font-brand text-3xl sm:text-5xl tracking-wide mb-6">
            ¿LISTO PARA{' '}
            <span className="relative inline-block">
              <span aria-hidden="true" className="absolute inset-0 -inset-x-3 bg-accent/90 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] -z-10" style={{ transform: 'rotate(-1deg)' }} />
              <span className="relative">CRECER</span>
            </span>
            ?
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto mb-8">
            Sin comisiones por pedido. Sin apps que instalar. Sin complicaciones. Tu food truck digital en minutos.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="#pricing"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-10 py-4 rounded-2xl text-lg font-bold hover:bg-primary/90 transition-all active:scale-95 shadow-xl ha-glow-red"
            >
              Comenzar Gratis
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 bg-card border border-border text-foreground px-10 py-4 rounded-2xl text-lg font-semibold hover:border-primary/50 transition-all"
            >
              🦍 Ver Demo en Vivo
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ Footer ═══ */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <span className="text-lg">🦍</span>
            <span className="font-brand text-sm">HUNGRY APE</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © 2026 Hungry Ape Fast Food App — Todos los derechos reservados.
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <Link href="/terminos" className="hover:text-foreground transition-colors">Términos</Link>
            <Link href="/privacidad" className="hover:text-foreground transition-colors">Privacidad</Link>
            <Link href="/soporte" className="hover:text-foreground transition-colors">Soporte</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

import Link from 'next/link';
import {
  QrCode, ChefHat, Smartphone, Shield, BarChart3, Zap, ArrowRight,
  Boxes, Banknote, SlidersHorizontal, CheckCircle, Star, Clock
} from 'lucide-react';
import { PricingSection } from '@/components/inicio/PricingSection';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const features = [
  {
    icon: QrCode,
    title: 'Menú QR con Categorías',
    description: 'Genera tu QR único. El cliente escanea, filtra por categoría y pide en segundos — sin apps, sin cuentas.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Pedidos Personalizados',
    description: 'El cliente elige salsas, extras y ajustes al pedir. La cocina ve cada detalle en el ticket: sin palta, bien cocido, mayonesa.',
    badge: 'Nuevo',
  },
  {
    icon: ChefHat,
    title: 'Cocina en Tiempo Real',
    description: 'Pedidos llegan al instante con todas las personalizaciones. Cambia el estado y el cliente lo ve en su pantalla.',
  },
  {
    icon: Shield,
    title: 'Retiro 100% Seguro',
    description: 'Cada pedido genera un código único. La cocina lo exige al entregar. Nadie se lleva comida sin pagar.',
  },
  {
    icon: Boxes,
    title: 'Inventario en Vivo',
    description: 'Stock que se descuenta solo con cada pedido. Alertas de stock bajo. Ajusta cantidades en un clic.',
  },
  {
    icon: Banknote,
    title: 'Caja y Arqueo',
    description: 'Abre caja con monto inicial, registra egresos y al cerrar el sistema calcula el arqueo automáticamente.',
    badge: 'Nuevo',
  },
  {
    icon: BarChart3,
    title: 'Reportes de Ventas',
    description: 'Ventas brutas, producto estrella, métodos de pago preferidos y pedidos completados. Todo en un dashboard claro.',
  },
  {
    icon: Smartphone,
    title: 'Funciona como App',
    description: 'Tus clientes instalan el menú desde el navegador sin ir al App Store. Ícono en pantalla, respuesta instantánea.',
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
                <Link href="/login" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Iniciar Sesión
                </Link>
                <Link href="/login" className="sm:hidden text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Entrar
                </Link>
                <Link
                  href="#pricing"
                  className="bg-primary text-primary-foreground px-3 py-2 sm:px-4 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all active:scale-95 shadow-md whitespace-nowrap"
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
            Menú QR, cocina en tiempo real, pedidos personalizados, caja y arqueo.
            <br className="hidden sm:block" />
            <strong className="text-foreground">Sin apps. Sin comisiones. Hecho para Chile.</strong>
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={user ? '/dashboard' : '#pricing'}
              className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-8 py-4 rounded-2xl text-lg font-bold hover:bg-primary/90 transition-all active:scale-95 shadow-xl ha-glow-red"
            >
              {user ? 'Ir a mi Food Truck' : 'Comenzar Gratis'}
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
          <div className="mt-16 flex flex-wrap justify-center gap-8 sm:gap-12">
            {[
              { value: '$0', label: 'Para empezar' },
              { value: '0%', label: 'Comisión por pedido' },
              { value: '14', label: 'Días de Starter gratis' },
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
              Desde el menú hasta el cierre de caja, todo conectado en tiempo real.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map(feature => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group relative bg-card rounded-2xl p-6 border border-border hover:border-primary/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                >
                  {feature.badge && (
                    <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                      {feature.badge}
                    </span>
                  )}
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-base mb-2 leading-snug">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ Spotlight — Nuevas funciones ═══ */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-bold mb-4 border border-primary/20">
              <Star className="h-3.5 w-3.5" /> Novedades
            </div>
            <h2 className="font-brand text-3xl sm:text-4xl tracking-wide">
              LO QUE NOS{' '}
              <span className="relative inline-block">
                <span aria-hidden="true" className="absolute inset-0 -inset-x-3 bg-accent/90 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] -z-10" style={{ transform: 'rotate(1deg)' }} />
                <span className="relative">DIFERENCIA</span>
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">

            {/* Spotlight 1 — Pedidos personalizados */}
            <div className="bg-card rounded-3xl border border-border p-8 flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <SlidersHorizontal className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-brand text-xl uppercase tracking-wide">Pedidos a Medida</h3>
                  <p className="text-xs text-muted-foreground">El cliente elige, la cocina lo sabe</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                Crea grupos de opciones para cada producto. El cliente los ve al pedir y la cocina recibe cada selección en el ticket.
              </p>

              {/* Mini demo */}
              <div className="bg-muted/50 rounded-2xl p-4 space-y-2 text-sm border border-border/50">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Ejemplo — Completo Italiano</p>
                <div className="flex items-start gap-2">
                  <span className="text-primary font-bold shrink-0">2×</span>
                  <div>
                    <p className="font-semibold">Completo Italiano</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {['Sin palta', 'Con mayonesa', 'Bien cocido'].map(tag => (
                        <span key={tag} className="text-[11px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <ul className="space-y-2 text-sm">
                {[
                  'Salsas, extras, punto de cocción, sin ingredientes',
                  'Grupos opcionales u obligatorios',
                  'Extras con costo adicional (ej: queso +$500)',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2 text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Spotlight 2 — Caja y Arqueo */}
            <div className="bg-card rounded-3xl border border-border p-8 flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Banknote className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-brand text-xl uppercase tracking-wide">Caja y Arqueo</h3>
                  <p className="text-xs text-muted-foreground">Sin planillas. Sin Excel.</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                Abre la caja con el monto inicial, vende durante el día y cierra con un arqueo automático que te dice si cuadra o no.
              </p>

              {/* Mini demo arqueo */}
              <div className="bg-muted/50 rounded-2xl p-4 space-y-2 border border-border/50">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Resumen de cierre</p>
                <div className="space-y-1.5 text-sm">
                  {[
                    { label: 'Apertura', value: '$20.000' },
                    { label: 'Ventas efectivo', value: '+$143.000' },
                    { label: 'Egresos', value: '-$15.000' },
                    { label: 'Efectivo esperado', value: '$148.000', bold: true },
                  ].map(row => (
                    <div key={row.label} className={`flex justify-between ${row.bold ? 'font-bold text-foreground border-t border-border pt-1.5 mt-1.5' : 'text-muted-foreground'}`}>
                      <span>{row.label}</span>
                      <span className={row.bold ? 'text-primary' : ''}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-border flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Diferencia</span>
                  <span className="font-bold text-green-500">✓ Caja cuadrada</span>
                </div>
              </div>

              <ul className="space-y-2 text-sm">
                {[
                  'Registro de egresos (proveedores, cambio, gastos)',
                  'Arqueo automático al cerrar',
                  'Historial de cierres anteriores',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2 text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-2">
                <span className="text-xs font-bold bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">
                  Disponible en Plan Starter
                </span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ═══ How it works ═══ */}
      <section className="py-20 bg-card/50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-brand text-3xl sm:text-5xl tracking-wide">
              CÓMO{' '}
              <span className="relative inline-block">
                <span aria-hidden="true" className="absolute inset-0 -inset-x-3 bg-accent/90 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] -z-10" style={{ transform: 'rotate(1deg)' }} />
                <span className="relative">FUNCIONA</span>
              </span>
            </h2>
            <p className="mt-4 text-muted-foreground">Listo para vender en menos de 10 minutos.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {[
              { step: '1', emoji: '📝', title: 'Crea tu negocio', desc: 'Registra tu food truck, sube tu menú con categorías, precios, stock y personalización de productos.' },
              { step: '2', emoji: '📱', title: 'Genera tu QR', desc: 'Imprime el código QR y ponlo en tu local. El cliente escanea y ve todo el menú al instante.' },
              { step: '3', emoji: '🍔', title: 'Recibe pedidos', desc: 'Los pedidos llegan a la cocina en tiempo real con todas las preferencias del cliente: salsas, extras, ajustes.' },
              { step: '4', emoji: '📊', title: 'Cierra el día', desc: 'Revisa ventas por método de pago, cierra caja con arqueo automático y analiza tus productos estrella.' },
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

      {/* ═══ Trial banner ═══ */}
      <section className="py-12">
        <div className="container mx-auto px-6">
          <div className="bg-primary/5 border border-primary/20 rounded-3xl p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <Clock className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h3 className="font-brand text-2xl uppercase tracking-wide">14 días de Starter gratis</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Caja, reportes, inventario ilimitado — sin tarjeta, sin compromiso. Al vencer, sigues gratis con el plan básico.
                </p>
              </div>
            </div>
            <Link
              href={user ? '/dashboard' : '#pricing'}
              className="shrink-0 inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-2xl font-bold hover:bg-primary/90 transition-all active:scale-95 shadow-lg whitespace-nowrap"
            >
              Probar gratis <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ Pricing ═══ */}
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
              href={user ? '/dashboard' : '#pricing'}
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
            © 2026 Hungry Ape — Hecho en Chile 🇨🇱 — Todos los derechos reservados.
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

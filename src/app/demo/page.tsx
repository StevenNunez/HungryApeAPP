'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Smartphone, ChefHat, ExternalLink, ArrowRight, Zap } from 'lucide-react';
import { KitchenView } from '@/components/cocina/KitchenView';

const DEMO_SLUG = 'hungry-ape-demo';

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState<'cliente' | 'cocina'>('cliente');

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:block">Inicio</span>
            </Link>
            <div className="h-4 w-px bg-border" />
            <Link href="/" className="flex items-baseline select-none">
              <div className="relative flex items-baseline">
                <span aria-hidden="true" className="absolute inset-0 -inset-x-3 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] bg-accent/90 -z-0" style={{ transform: 'rotate(-1.5deg) skewX(-2deg)' }} />
                <span className="relative z-10 font-brand text-lg tracking-wider" style={{ lineHeight: 1 }}>HUNGRY</span>
                <span className="relative z-10 text-base mx-0.5" style={{ lineHeight: 1 }}>🍌</span>
                <span className="relative z-10 font-brand text-lg tracking-wider" style={{ lineHeight: 1 }}>APE</span>
              </div>
            </Link>
            <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
              <Zap className="h-3 w-3" /> Demo Interactiva
            </span>
          </div>
          <Link
            href="/#pricing"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all active:scale-95 shadow-md"
          >
            Registrarse gratis
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="container mx-auto px-6 py-8 text-center max-w-3xl">
        <h1 className="font-brand text-4xl sm:text-5xl tracking-wide leading-tight mb-3">
          ASÍ FUNCIONA{' '}
          <span className="relative inline-block">
            <span aria-hidden="true" className="absolute inset-0 -inset-x-3 bg-accent/90 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] -z-10" style={{ transform: 'rotate(-1deg) skewX(-2deg)' }} />
            <span className="relative">EN VIVO</span>
          </span>
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Hacé un pedido como cliente y mirá cómo aparece en cocina en tiempo real. El ciclo completo.
        </p>
        <div className="mt-4 inline-flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-5 py-3 text-sm">
          <span className="text-xl">💡</span>
          <p className="text-left text-foreground/80">
            <strong className="text-foreground">En desktop</strong> ves las dos vistas al mismo tiempo.
            <strong className="text-foreground"> En mobile</strong> usá las pestañas — el estado se mantiene al cambiar.
          </p>
        </div>
      </section>

      {/* ── Mobile tabs (solo visible < lg) ── */}
      <div className="lg:hidden container mx-auto px-6 mb-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setActiveTab('cliente')}
            className={`flex items-center justify-center gap-2 p-3 rounded-2xl border-2 font-semibold transition-all text-sm ${
              activeTab === 'cliente'
                ? 'border-primary bg-primary/5 text-primary shadow-md'
                : 'border-border bg-card text-muted-foreground hover:border-primary/30'
            }`}
          >
            <Smartphone className="h-4 w-4" />
            Vista Cliente
          </button>
          <button
            onClick={() => setActiveTab('cocina')}
            className={`flex items-center justify-center gap-2 p-3 rounded-2xl border-2 font-semibold transition-all text-sm ${
              activeTab === 'cocina'
                ? 'border-primary bg-primary/5 text-primary shadow-md'
                : 'border-border bg-card text-muted-foreground hover:border-primary/30'
            }`}
          >
            <ChefHat className="h-4 w-4" />
            Vista Cocina
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 container mx-auto px-4 pb-12">

        {/* DESKTOP: side by side — MOBILE: stacked with show/hide via CSS */}
        <div className="lg:grid lg:grid-cols-[420px_1fr] lg:gap-8 lg:items-start">

          {/* ─── CLIENTE (phone mockup) ─── */}
          {/* IMPORTANTE: usamos visibility + display en vez de condicional para no desmontar el iframe */}
          <div className={`${activeTab === 'cliente' ? 'block' : 'hidden'} lg:block`}>
            <div className="flex items-center justify-between mb-3 px-1">
              <div>
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-primary" />
                  <p className="text-sm font-bold">Vista del Cliente</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Escaneá el QR o navegá el menú y hacé un pedido</p>
              </div>
              <Link
                href={`/m/${DEMO_SLUG}`}
                target="_blank"
                className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline shrink-0"
              >
                Abrir <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            {/* Phone shell */}
            <div className="relative mx-auto lg:mx-0" style={{ maxWidth: '390px' }}>
              <div className="relative bg-zinc-900 rounded-[3rem] p-3 shadow-2xl border-4 border-zinc-800 ring-1 ring-white/5">
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-7 bg-zinc-900 rounded-b-2xl z-10 flex items-center justify-center">
                  <div className="w-12 h-1.5 bg-zinc-800 rounded-full" />
                </div>
                {/* Screen — iframe siempre montado para mantener el estado de navegación */}
                <div className="relative overflow-hidden rounded-[2.3rem] bg-background" style={{ height: '680px' }}>
                  <iframe
                    src={`/m/${DEMO_SLUG}`}
                    className="w-full h-full border-0"
                    title="Vista del cliente — Hungry Ape Demo"
                  />
                </div>
                {/* Home bar */}
                <div className="flex justify-center mt-3">
                  <div className="w-24 h-1 bg-zinc-700 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {/* ─── COCINA ─── */}
          <div className={`${activeTab === 'cocina' ? 'block' : 'hidden'} lg:block`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <ChefHat className="h-4 w-4 text-primary" />
                  <p className="text-sm font-bold">Vista de Cocina</p>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-green-500">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> En vivo
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Los pedidos del cliente aparecen aquí al instante. Mové los estados para ver el flujo.</p>
              </div>
            </div>

            {/* Flow visual */}
            <div className="mb-4 flex items-center gap-1 overflow-x-auto pb-1 text-[11px] font-bold text-muted-foreground">
              {['Por Pagar', '→', 'Pendiente', '→', 'En preparación', '→', 'Listo', '→', 'Entregado'].map((s, i) => (
                <span key={i} className={s === '→' ? 'text-border px-0.5 shrink-0' : 'bg-muted px-2.5 py-1 rounded-full whitespace-nowrap shrink-0'}>
                  {s}
                </span>
              ))}
            </div>

            <KitchenView tenantSlug={DEMO_SLUG} />
          </div>
        </div>
      </div>

      {/* ── CTA final ── */}
      <div className="border-t border-border bg-card/50 py-8">
        <div className="container mx-auto px-6 text-center">
          <p className="text-muted-foreground mb-4">¿Te convenciste? Tu food truck digital en minutos, gratis.</p>
          <Link
            href="/#pricing"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-4 rounded-2xl text-lg font-bold hover:bg-primary/90 transition-all active:scale-95 shadow-xl"
          >
            Crear mi Food Truck gratis <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

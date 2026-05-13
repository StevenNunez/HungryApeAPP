'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Smartphone, ChefHat, ExternalLink, ArrowRight, Zap } from 'lucide-react';
import { KitchenView } from '@/components/cocina/KitchenView';

const DEMO_SLUG = 'hungry-ape-demo';

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState<'cliente' | 'cocina'>('cliente');

  // Limpia pedidos viejos y restaura stock al entrar a la demo
  useEffect(() => {
    fetch('/api/demo/cleanup', { method: 'POST' }).catch(() => { });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-4 sm:px-6 gap-3">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:block">Inicio</span>
            </Link>
            <div className="h-4 w-px bg-border shrink-0" />
            <Link href="/" className="flex items-baseline select-none shrink-0">
              <div className="relative flex items-baseline">
                <span aria-hidden="true" className="absolute inset-0 -inset-x-3 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] bg-accent/90 -z-0" style={{ transform: 'rotate(-1.5deg) skewX(-2deg)' }} />
                <span className="relative z-10 font-brand text-base sm:text-lg tracking-wider" style={{ lineHeight: 1 }}>HUNGRY</span>
                <span className="relative z-10 text-sm sm:text-base mx-0.5" style={{ lineHeight: 1 }}>🍌</span>
                <span className="relative z-10 font-brand text-base sm:text-lg tracking-wider" style={{ lineHeight: 1 }}>APE</span>
              </div>
            </Link>
            <span className="hidden sm:inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full shrink-0">
              <Zap className="h-3 w-3" /> Demo Interactiva
            </span>
          </div>
          <Link
            href="/#pricing"
            className="shrink-0 bg-primary text-primary-foreground px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold hover:bg-primary/90 transition-all active:scale-95 shadow-md whitespace-nowrap"
          >
            Empezar gratis
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 text-center max-w-3xl">
        <h1 className="font-brand text-3xl sm:text-5xl tracking-wide leading-tight mb-3">
          ASÍ FUNCIONA{' '}
          <span className="relative inline-block">
            <span aria-hidden="true" className="absolute inset-0 -inset-x-3 bg-accent/90 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] -z-10" style={{ transform: 'rotate(-1deg) skewX(-2deg)' }} />
            <span className="relative">EN VIVO</span>
          </span>
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
          Haz un pedido como cliente —elige salsas, extras y personaliza a tu gusto— y mira cómo aparece en cocina en tiempo real.
        </p>

        {/* Steps guide */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left">
          {[
            { n: '1', emoji: '🍔', title: 'Elige y personaliza', desc: 'Agrega salsas, extras o ajustes al producto' },
            { n: '2', emoji: '🛒', title: 'Confirma tu pedido', desc: 'Ingresa tu apodo y elige cómo pagas' },
            { n: '3', emoji: '👨‍🍳', title: 'Mira la cocina', desc: 'Tu pedido aparece en cocina al instante' },
          ].map(step => (
            <div key={step.n} className="flex items-start gap-3 bg-card border border-border rounded-2xl px-4 py-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">{step.n}</span>
              <div>
                <p className="text-sm font-bold text-foreground leading-snug">{step.emoji} {step.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 inline-flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 text-xs sm:text-sm">
          <span className="text-base">💡</span>
          <p className="text-left text-foreground/80">
            <strong className="text-foreground">Desktop:</strong> ambas vistas en paralelo.{' '}
            <strong className="text-foreground">Mobile:</strong> usa las pestañas de abajo para cambiar de vista.
          </p>
        </div>
      </section>

      {/* ── Mobile tabs (solo visible < lg) ── */}
      <div className="lg:hidden container mx-auto px-4 mb-4">
        <div className="flex rounded-2xl border-2 border-border overflow-hidden bg-card">
          <button
            onClick={() => setActiveTab('cliente')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 font-semibold transition-all text-sm ${activeTab === 'cliente'
              ? 'bg-primary text-primary-foreground shadow-inner'
              : 'text-muted-foreground hover:bg-muted'
              }`}
          >
            <Smartphone className="h-4 w-4 shrink-0" />
            <span>Vista Cliente</span>
          </button>
          <div className="w-px bg-border" />
          <button
            onClick={() => setActiveTab('cocina')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 font-semibold transition-all text-sm ${activeTab === 'cocina'
              ? 'bg-primary text-primary-foreground shadow-inner'
              : 'text-muted-foreground hover:bg-muted'
              }`}
          >
            <ChefHat className="h-4 w-4 shrink-0" />
            <span>Vista Cocina</span>
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 container mx-auto px-3 sm:px-4 pb-12">

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
                <p className="text-xs text-muted-foreground mt-0.5">Navega el menú, personaliza con salsas y extras, y haz tu pedido</p>
              </div>
              <Link
                href={`/m/${DEMO_SLUG}`}
                target="_blank"
                className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline shrink-0 ml-2"
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
                <div className="relative overflow-hidden rounded-[2.3rem] bg-background" style={{ height: 'min(950px, calc(100svh - 140px))' }}>
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

            {/* Mobile switch hint */}
            <div className="lg:hidden mt-4 text-center">
              <button
                onClick={() => setActiveTab('cocina')}
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary bg-primary/10 border border-primary/20 px-4 py-2 rounded-full hover:bg-primary/15 transition-colors active:scale-95"
              >
                <ChefHat className="h-4 w-4" />
                Ver cómo llega a cocina
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ─── COCINA ─── */}
          <div className={`${activeTab === 'cocina' ? 'block' : 'hidden'} lg:block`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <ChefHat className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-sm font-bold">Vista de Cocina</p>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-green-500">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> En vivo
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Los pedidos aparecen aquí al instante. Toca los estados para avanzarlos en el flujo.</p>
              </div>
            </div>

            {/* Flow visual */}
            <div className="mb-4 flex items-center gap-1 overflow-x-auto pb-2 scrollbar-none text-[11px] font-bold text-muted-foreground">
              {['Por Pagar', '→', 'Pendiente', '→', 'En preparación', '→', 'Listo', '→', 'Entregado'].map((s, i) => (
                <span key={i} className={s === '→' ? 'text-border px-1 shrink-0 opacity-50' : 'bg-muted px-2.5 py-1 rounded-full whitespace-nowrap shrink-0'}>
                  {s}
                </span>
              ))}
            </div>

            <KitchenView tenantSlug={DEMO_SLUG} compact />

            {/* Mobile switch back hint */}
            <div className="lg:hidden mt-6 text-center">
              <button
                onClick={() => setActiveTab('cliente')}
                className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground bg-muted border border-border px-4 py-2 rounded-full hover:border-primary/30 transition-colors active:scale-95"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver al menú del cliente
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── CTA final ── */}
      <div className="border-t border-border bg-card/50 py-8 sm:py-10">
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <p className="font-brand text-xl sm:text-2xl uppercase tracking-wide mb-1">¿Te convenció?</p>
          <p className="text-muted-foreground text-sm mb-5">Tu food truck digital con pedidos personalizados, en minutos y gratis.</p>
          <Link
            href="/#pricing"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl text-base sm:text-lg font-bold hover:bg-primary/90 transition-all active:scale-95 shadow-xl"
          >
            Crear mi Food Truck gratis <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

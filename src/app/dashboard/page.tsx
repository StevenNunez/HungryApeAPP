'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenant, NO_TENANT_MESSAGE } from '@/hooks/useTenant';
import { Logo } from '@/components/compartido/Logo';
import { FirstSteps } from '@/components/inicio/FirstSteps';
import { PLAN_LABEL, dailyOrderLimit, canUseReports, canUseCashRegister, canUseSupplies } from '@/lib/plans';
import { PanelSkeleton } from '@/components/compartido/PanelSkeleton';
import { TenantGate } from '@/components/compartido/TenantGate';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, ChefHat, Package, LogOut, Settings, Crown, Zap, Boxes, Lock, AlertTriangle, ArrowRight, Banknote } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FREE_PLAN_MAX_ORDERS, FREE_PLAN_ALERT_THRESHOLD, getTodayOrderCount, getEffectivePlan } from '@/lib/data';

const PLAN_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  gratis: { label: PLAN_LABEL.gratis, color: 'bg-muted text-muted-foreground border-border', icon: <Zap className="h-3 w-3" /> },
  basico: { label: PLAN_LABEL.basico, color: 'bg-teal-500/10 text-teal-800 border-teal-500/20', icon: <Zap className="h-3 w-3" /> },
  starter: { label: PLAN_LABEL.starter, color: 'bg-blue-500/10 text-blue-800 border-blue-500/20', icon: <Zap className="h-3 w-3" /> },
  pro: { label: PLAN_LABEL.pro, color: 'bg-primary/10 text-primary border-primary/20', icon: <Crown className="h-3 w-3" /> },
  enterprise: { label: PLAN_LABEL.enterprise, color: 'bg-purple-500/10 text-purple-800 border-purple-500/20', icon: <Crown className="h-3 w-3" /> },
};

function PlanBadge({ planId, status, trialEndsAt }: { planId?: string | null; status?: string | null; trialEndsAt?: string | null }) {
  const now = Date.now();
  const isTrialActive = status === 'trial' && trialEndsAt && new Date(trialEndsAt).getTime() > now;
  const isTrialExpired = status === 'trial' && trialEndsAt && new Date(trialEndsAt).getTime() <= now;
  const daysLeft = isTrialActive
    ? Math.ceil((new Date(trialEndsAt!).getTime() - now) / 86400000)
    : 0;
  const effectivePlanId = isTrialActive ? 'starter' : (planId || 'gratis');
  const plan = PLAN_LABELS[effectivePlanId] ?? PLAN_LABELS.gratis;

  const statusBadge = () => {
    if (isTrialActive) return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold uppercase tracking-widest border bg-blue-500/10 text-blue-800 border-blue-500/20">
        Trial · {daysLeft}d
      </span>
    );
    if (isTrialExpired) return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold uppercase tracking-widest border bg-red-500/10 text-red-700 border-red-500/20">
        ● Vencida
      </span>
    );
    if (!planId || planId === 'gratis') return null;
    if (status === 'active') return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold uppercase tracking-widest border bg-green-500/10 text-green-800 border-green-500/20">
        ● Activo
      </span>
    );
    if (status === 'cancelled') return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold uppercase tracking-widest border bg-red-500/10 text-red-700 border-red-500/20">
        ● Cancelado
      </span>
    );
    if (status === 'paused') return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold uppercase tracking-widest border bg-amber-500/10 text-amber-800 border-amber-500/20">
        ● Pausado
      </span>
    );
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold uppercase tracking-widest border bg-amber-500/10 text-amber-800 border-amber-500/20 animate-pulse">
        ● Pendiente
      </span>
    );
  };

  return (
    <div className="flex items-center gap-2 mt-1 sm:mt-0">
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border ${plan.color}`}>
        {plan.icon}
        {plan.label}
      </span>
      {statusBadge()}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { tenant, status, userEmail, role, error } = useTenant();
  const isOwner = role === 'dueno';
  const [todayOrders, setTodayOrders] = useState<number>(0);
  const [subAlert, setSubAlert] = useState<'trial_expiring' | 'expired' | 'cancelled' | 'paused' | null>(null);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number>(0);

  // No business yet (signed up with Google / email link) → setup wizard
  useEffect(() => {
    if (status === 'not_found' && error === NO_TENANT_MESSAGE) router.replace('/dashboard/setup');
    if (status === 'unauthenticated') router.replace('/login');
    // The kitchen staff's home is the kitchen
    if (status === 'found' && role === 'cocina') router.replace('/dashboard/cocina');
  }, [status, role, error, router]);

  useEffect(() => {
    async function loadDashboard() {
      const tenantData = tenant;
      if (!tenantData) return;

      // Load today's order count for Free plan users (trial = starter, so no limit)
      const effectivePlan = getEffectivePlan(tenantData);
      if (dailyOrderLimit(effectivePlan) !== null) {
        const count = await getTodayOrderCount(tenantData.id);
        setTodayOrders(count);
      }

      // Compute subscription alert state for persistent banners (billing is the owner's business)
      const td = tenantData;
      if (td && role === 'dueno') {
        const now = Date.now();
        const trialEnd = td.trial_ends_at ? new Date(td.trial_ends_at).getTime() : 0;
        const isTrialActive = td.subscription_status === 'trial' && trialEnd > now;
        const isTrialExpired = td.subscription_status === 'trial' && trialEnd <= now;

        if (isTrialExpired) {
          setSubAlert('expired');
        } else if (isTrialActive) {
          const days = Math.ceil((trialEnd - now) / 86400000);
          setTrialDaysLeft(days);
          if (days <= 7) setSubAlert('trial_expiring');
        } else if (td.plan_id && td.plan_id !== 'gratis' && td.subscription_status === 'cancelled') {
          setSubAlert('cancelled');
        } else if (td.plan_id && td.plan_id !== 'gratis' && td.subscription_status === 'paused') {
          setSubAlert('paused');
        } else if (td.plan_id && td.plan_id !== 'gratis' && td.subscription_status !== 'active') {
          setSubAlert('expired');
        }
      }
    }

    loadDashboard();
  }, [tenant, role]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast({ title: 'Sesión cerrada', description: '¡Hasta pronto! 🦍' });
    router.push('/');
  };

  if (status === 'blocked' || (status === 'not_found' && error !== NO_TENANT_MESSAGE)) {
    return <TenantGate status={status} error={error} />;
  }
  if (!tenant) {
    return <PanelSkeleton label="Cargando tu panel…" />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Logo size="sm" tagline={false} />
            <span className="text-muted-foreground text-sm hidden sm:block">/ Panel</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {userEmail}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="font-brand text-3xl sm:text-4xl tracking-wide">
            ¡Hola, <span className="text-primary">{tenant?.name || 'Food Trucker'}</span>!
          </h1>
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 mt-3">
            <p className="text-muted-foreground">
              Administra tu food truck desde aquí.
            </p>
            <PlanBadge planId={tenant?.plan_id} status={tenant?.subscription_status} trialEndsAt={tenant?.trial_ends_at} />
          </div>
        </div>

        {/* ―― First steps for a new business (owner) ―― */}
        {isOwner && tenant && <FirstSteps tenantId={tenant.id} slug={tenant.slug} />}

        {/* ―― Alert banner: subscription expired / cancelled ―― */}
        {(subAlert === 'expired' || subAlert === 'cancelled' || subAlert === 'paused') && (
          <div className="mb-6 relative overflow-hidden flex items-start gap-4 bg-red-500/10 border border-red-500/40 rounded-2xl px-5 py-4">
            <AlertTriangle className="h-5 w-5 text-red-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-red-800 text-sm">
                {subAlert === 'cancelled' && 'Tu suscripción fue cancelada'}
                {subAlert === 'paused' && 'Tu suscripción está pausada'}
                {subAlert === 'expired' && 'Tu período de prueba ha vencido'}
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                {subAlert === 'cancelled' && 'Sin plan activo tus clientes ven el menú, pero los pedidos por la app están en pausa. Activa el Plan Básico (desde $4.990/mes) para volver a recibirlos.'}
                {subAlert === 'paused' && 'Mientras esté pausada, tus clientes ven el menú pero no pueden pedir por la app. Actívala para volver a recibir pedidos.'}
                {subAlert === 'expired' && 'Terminaron tus 14 días de prueba: tus clientes ven el menú, pero los pedidos por la app están en pausa. Activa el Plan Básico (desde $4.990/mes) para volver a recibirlos.'}
              </p>
            </div>
            <Link
              href="/#pricing"
              className="shrink-0 inline-flex items-center gap-1.5 bg-red-500 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-red-400 transition-colors"
            >
              Activar plan <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {/* ―― Alert banner: trial expiring soon (≤ 7 days) ―― */}
        {subAlert === 'trial_expiring' && (
          <div className="mb-6 relative overflow-hidden flex items-start gap-4 bg-amber-500/10 border border-amber-500/40 rounded-2xl px-5 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-800 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-amber-800 text-sm">
                {trialDaysLeft === 1 ? '¡Tu prueba vence hoy!' : `Tu prueba vence en ${trialDaysLeft} días`}
              </p>
              <p className="text-xs text-amber-900 mt-0.5">
                Con el Plan Starter mantienes pedidos ilimitados, caja, inventario y reportes.
              </p>
            </div>
            <Link
              href="/#pricing"
              className="shrink-0 inline-flex items-center gap-1.5 bg-amber-500 text-black text-xs font-bold px-4 py-2 rounded-xl hover:bg-amber-400 transition-colors"
            >
              Ver planes <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {/* ―― Alert banner: 80% of daily order limit ―― */}
        {isOwner && tenant && (dailyOrderLimit(getEffectivePlan(tenant)) ?? 0) > 0 && todayOrders >= FREE_PLAN_ALERT_THRESHOLD && (
          <div className="mb-6 relative overflow-hidden flex items-start gap-4 bg-amber-500/10 border border-amber-500/40 rounded-2xl px-5 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-800 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-amber-800 text-sm">
                Te quedan {FREE_PLAN_MAX_ORDERS - todayOrders} pedidos hoy
              </p>
              <p className="text-xs text-amber-900 mt-0.5">
                {tenant && getEffectivePlan(tenant) === 'basico'
                  ? <>El Plan Básico incluye hasta {FREE_PLAN_MAX_ORDERS} pedidos por día. Con Starter no tienes límite.</>
                  : <>Sin un plan activo tienes un límite de {FREE_PLAN_MAX_ORDERS} pedidos por día. Activa un plan para no frenar tu negocio.</>}
              </p>
            </div>
            <Link
              href="/#pricing"
              className="shrink-0 inline-flex items-center gap-1.5 bg-amber-500 text-black text-xs font-bold px-4 py-2 rounded-xl hover:bg-amber-400 transition-colors"
            >
              Elegir mi plan <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6 mb-10">
          <Link href="/dashboard/menu">
            <Card className="border-border hover:border-primary/40 transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer group">
              <CardHeader className="pb-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Mi Menú</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Agrega, edita o elimina productos de tu menú. Controla stock y precios.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/cocina">
            <Card className="border-border hover:border-primary/40 transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer group">
              <CardHeader className="pb-3">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-2 group-hover:bg-blue-500/20 transition-colors">
                  <ChefHat className="h-6 w-6 text-blue-800" />
                </div>
                <CardTitle className="text-lg">Cocina</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Ve los pedidos en tiempo real y gestiona su preparación y entrega.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/qr">
            <Card className="border-border hover:border-primary/40 transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer group h-full">
              <CardHeader className="pb-3">
                <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center mb-2 group-hover:bg-accent/30 transition-colors">
                  <QrCode className="h-6 w-6 text-accent-foreground" />
                </div>
                <CardTitle className="text-lg">Código QR</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Genera e imprime tu código QR para que los clientes accedan a tu menú.</p>
              </CardContent>
            </Card>
          </Link>

          {/* Inventario & Reportes: Starter and up (landing) */}
          {tenant && !canUseReports(getEffectivePlan(tenant)) ? (
            <Link href="/#pricing">
              <Card className="relative border-dashed border-border hover:border-amber-500/60 transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer group h-full opacity-80 hover:opacity-100">
                <CardHeader className="pb-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-2 group-hover:bg-amber-500/20 transition-colors">
                    <Boxes className="h-6 w-6 text-amber-800" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-lg">Inventario &amp; Reportes</CardTitle>
                    <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-500/30 uppercase tracking-wider whitespace-nowrap">
                      <Lock className="h-2.5 w-2.5" /> Starter
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Stock en tiempo real, alertas de stock bajo y m&#233;tricas de ventas.</p>
                  <p className="text-xs text-amber-800 mt-2 font-semibold">Disponible en Starter &#8594;</p>
                </CardContent>
              </Card>
            </Link>
          ) : (
            <Link href="/dashboard/reportes">
              <Card className="border-border hover:border-primary/40 transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer group h-full">
                <CardHeader className="pb-3">
                  <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center mb-2 group-hover:bg-green-500/20 transition-colors">
                    <Boxes className="h-6 w-6 text-green-800" />
                  </div>
                  <CardTitle className="text-lg">Inventario &amp; Reportes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Controla tu stock en tiempo real y revisa m&#233;tricas de ventas.</p>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Caja: Starter and up (landing) */}
          {tenant && !canUseCashRegister(getEffectivePlan(tenant)) ? (
            <Link href="/#pricing">
              <Card className="relative border-dashed border-border hover:border-amber-500/60 transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer group h-full opacity-80 hover:opacity-100">
                <CardHeader className="pb-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-2 group-hover:bg-amber-500/20 transition-colors">
                    <Banknote className="h-6 w-6 text-amber-800" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-lg">Caja</CardTitle>
                    <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-500/30 uppercase tracking-wider whitespace-nowrap">
                      <Lock className="h-2.5 w-2.5" /> Starter
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Inicio y cierre de caja con arqueo automático y registro de diferencias.</p>
                  <p className="text-xs text-amber-800 mt-2 font-semibold">Disponible en Starter &#8594;</p>
                </CardContent>
              </Card>
            </Link>
          ) : (
            <Link href="/dashboard/caja">
              <Card className="border-border hover:border-primary/40 transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer group h-full">
                <CardHeader className="pb-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-2 group-hover:bg-emerald-500/20 transition-colors">
                    <Banknote className="h-6 w-6 text-emerald-800" />
                  </div>
                  <CardTitle className="text-lg">Caja</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Abre y cierra caja, arqueo automático y revisión de sobrantes/faltantes.</p>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Insumos por receta: Pro and up (landing) */}
          <Link href={tenant && canUseSupplies(getEffectivePlan(tenant)) ? '/dashboard/insumos' : '/#pricing'}>
            <Card className={`border-border hover:border-primary/40 transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer group h-full ${tenant && canUseSupplies(getEffectivePlan(tenant)) ? '' : 'border-dashed opacity-80 hover:opacity-100'}`}>
              <CardHeader className="pb-3">
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-2 group-hover:bg-orange-500/20 transition-colors">
                  <Boxes className="h-6 w-6 text-orange-800" />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-lg">Insumos</CardTitle>
                  {tenant && !canUseSupplies(getEffectivePlan(tenant)) && (
                    <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-500/30 uppercase tracking-wider whitespace-nowrap">
                      <Lock className="h-2.5 w-2.5" /> Pro
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Cada venta descuenta pan, salchicha, palta… Sabes qué reponer antes de quedarte sin stock.</p>
              </CardContent>
            </Card>
          </Link>

          {isOwner && (
          <Link href="/dashboard/configuracion">
            <Card className="border-border hover:border-primary/40 transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer group h-full">
              <CardHeader className="pb-3">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-2 group-hover:bg-purple-500/20 transition-colors">
                  <Settings className="h-6 w-6 text-purple-800" />
                </div>
                <CardTitle className="text-lg">Configuración</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Perfil del food truck, opciones de pago y tu equipo.</p>
              </CardContent>
            </Card>
          </Link>
          )}
        </div>

        {/* Tenant info */}
        {tenant && (
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground font-normal">Tu enlace de menú público</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <code className="bg-muted px-4 py-2 rounded-xl text-sm flex-1 font-mono">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/m/{tenant.slug}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/m/${tenant.slug}`);
                    toast({ title: '📋 Link copiado', description: 'Compártelo con tus clientes.' });
                  }}
                >
                  Copiar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

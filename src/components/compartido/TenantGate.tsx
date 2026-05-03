'use client';

import Link from 'next/link';
import { Loader2, AlertCircle, LogIn, Plus } from 'lucide-react';
import { TenantStatus } from '@/hooks/useTenant';

interface TenantGateProps {
  status: TenantStatus;
  error: string | null;
}

export function TenantGate({ status, error }: TenantGateProps) {
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground font-medium">Cargando tu negocio...</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 p-6">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
          <LogIn className="h-8 w-8 text-primary" />
        </div>
        <div className="text-center">
          <h1 className="font-brand text-3xl uppercase tracking-wide mb-2">Sesión requerida</h1>
          <p className="text-muted-foreground">Necesitas iniciar sesión para acceder a esta sección.</p>
        </div>
        <Link
          href="/login"
          className="bg-primary text-primary-foreground font-bold px-8 py-4 rounded-2xl hover:bg-primary/90 transition-all active:scale-95"
        >
          Iniciar Sesión
        </Link>
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 p-6 text-center">
        <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
        </div>
        <div>
          <h1 className="font-brand text-3xl uppercase tracking-wide mb-2">Negocio no configurado</h1>
          <p className="text-muted-foreground max-w-sm">
            {error || 'Tu cuenta no tiene un negocio asociado.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/dashboard/setup"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-3 rounded-2xl hover:bg-primary/90 transition-all active:scale-95"
          >
            <Plus className="h-5 w-5" />
            Configurar mi Negocio
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-muted text-foreground font-bold px-6 py-3 rounded-2xl hover:bg-muted/80 transition-all"
          >
            Volver al Dashboard
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          ¿Ya tienes cuenta con un plan?{' '}
          <Link href="/login" className="text-primary hover:underline">Inicia sesión de nuevo</Link>
        </p>
      </div>
    );
  }

  return null;
}

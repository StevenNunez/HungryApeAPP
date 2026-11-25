'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock, ChefHat } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';
import { TenantGate } from './TenantGate';
import { canAccess, ROLE_LABEL, type PanelArea } from '@/lib/roles';

/** Which permission each panel route needs. */
export function areaForPath(pathname: string): PanelArea | null {
  if (pathname === '/dashboard') return 'inicio';
  if (pathname.startsWith('/dashboard/setup')) return null;
  const segment = pathname.split('/')[2] as PanelArea | undefined;
  const known: PanelArea[] = ['cocina', 'menu', 'caja', 'reportes', 'insumos', 'qr', 'configuracion', 'equipo'];
  return segment && known.includes(segment) ? segment : null;
}

/**
 * Blocks a panel section the person's role can't use (the database enforces it too;
 * this avoids a broken-looking screen full of permission errors).
 */
export function PanelAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const { role, status, error } = useTenant();
  const area = areaForPath(pathname);

  if (status === 'blocked' && area) return <TenantGate status="blocked" error={error} />;
  if (status !== 'found' || !area || canAccess(role, area)) return <>{children}</>;

  return (
    <main className="min-h-[70vh] grid place-items-center p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-lg space-y-3">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-muted">
          <Lock className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="font-brand text-2xl tracking-wide">Sección del dueño</h1>
        <p className="text-sm text-muted-foreground">
          Tu rol en este local es <strong className="text-foreground">{role ? ROLE_LABEL[role] : '—'}</strong> y no
          incluye esta sección. Si la necesitas, pídele acceso al dueño.
        </p>
        <Link
          href="/dashboard/cocina"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-6 font-bold text-primary-foreground"
        >
          <ChefHat className="h-5 w-5" /> Ir a la cocina
        </Link>
      </div>
    </main>
  );
}

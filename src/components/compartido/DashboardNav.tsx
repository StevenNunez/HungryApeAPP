'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ChefHat, UtensilsCrossed, Wallet, BarChart3, Settings, QrCode } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';
import { canAccess, type PanelArea } from '@/lib/roles';

const ITEMS: { href: string; label: string; icon: typeof Home; area: PanelArea; exact?: boolean; also?: string[] }[] = [
  { href: '/dashboard', label: 'Inicio', icon: Home, area: 'inicio', exact: true },
  { href: '/dashboard/cocina', label: 'Cocina', icon: ChefHat, area: 'cocina' },
  { href: '/dashboard/menu', label: 'Menú', icon: UtensilsCrossed, area: 'menu' },
  { href: '/dashboard/caja', label: 'Caja', icon: Wallet, area: 'caja' },
  { href: '/dashboard/reportes', label: 'Reportes', icon: BarChart3, area: 'reportes', also: ['/dashboard/insumos'] },
  { href: '/dashboard/configuracion', label: 'Más', icon: Settings, area: 'configuracion', also: ['/dashboard/qr', '/dashboard/equipo'] },
  // Managers don't see settings: QR takes that slot for them
  { href: '/dashboard/qr', label: 'QR', icon: QrCode, area: 'qr' },
];

/**
 * Panel navigation: a bar fixed at the bottom (thumb reach on the phone, between
 * shifts), a floating pill on larger screens. Shows only what the person's role can use.
 */
export function DashboardNav() {
  const pathname = usePathname() ?? '';
  const { role } = useTenant();
  if (pathname.startsWith('/dashboard/setup')) return null;

  const items = ITEMS.filter(item => {
    if (!canAccess(role, item.area)) return false;
    // The owner reaches QR from "Más"; a manager gets the QR shortcut instead
    if (item.area === 'qr' && canAccess(role, 'configuracion')) return false;
    return true;
  });
  if (items.length <= 1) return null;

  return (
    <nav
      aria-label="Secciones del panel"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:inset-x-auto md:left-1/2 md:bottom-4 md:-translate-x-1/2 md:rounded-2xl md:border md:shadow-xl md:pb-0"
    >
      <ul className="flex md:gap-1 md:px-2">
        {items.map(({ href, label, icon: Icon, exact, also }) => {
          const active = exact
            ? pathname === href
            : pathname.startsWith(href) || (also ?? []).some(a => pathname.startsWith(a));
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs font-semibold transition-colors md:min-h-12 md:flex-row md:gap-2 md:px-4 md:text-sm ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-5 w-5 md:h-4 md:w-4" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

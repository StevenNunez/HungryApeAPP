'use client';

import { useTenant } from '@/hooks/useTenant';
import { TenantGate } from '@/components/compartido/TenantGate';
import { KitchenView } from '@/components/cocina/KitchenView';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function CocinaAdminPage() {
  const { tenant, status, error } = useTenant();

  if (status !== 'found') {
    return <TenantGate status={status} error={error} />;
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b border-border p-4 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-1 text-sm font-medium hover:text-primary transition-colors">
            <ChevronLeft className="h-4 w-4" /> Panel
          </Link>
          <div className="font-brand text-xl tracking-tighter uppercase">
            Cocina — <span className="text-primary">{tenant.name}</span>
          </div>
          {/* The real connection state is shown inside the kitchen board */}
          <div className="w-16" aria-hidden="true" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <KitchenView tenantSlug={tenant.slug} />
      </main>
    </div>
  );
}

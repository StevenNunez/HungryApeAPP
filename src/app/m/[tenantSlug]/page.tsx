import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantMenu } from '@/lib/menu-server';
import { MenuView } from '@/components/menu/MenuView';

type Props = { params: Promise<{ tenantSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenantSlug } = await params;
  const menu = await getTenantMenu(tenantSlug);
  if (!menu) return { title: 'Menú no encontrado', robots: { index: false } };
  return {
    title: `${menu.tenant.name} — Menú`,
    description: menu.tenant.description || `Mira el menú de ${menu.tenant.name} y pide desde tu celular.`,
  };
}

export default async function TenantMenuPage({ params }: Props) {
  const { tenantSlug } = await params;
  const menu = await getTenantMenu(tenantSlug);
  if (!menu) notFound();

  return (
    <MenuView
      tenantSlug={tenantSlug}
      tenantId={menu.tenant.id}
      tenantName={menu.tenant.name}
      initialItems={menu.items}
      initialGroups={menu.groups}
    />
  );
}

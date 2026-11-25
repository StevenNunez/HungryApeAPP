'use client';
import { CartProvider } from '@/context/CartContext';
import { Cart } from '@/components/carrito/Cart';
import { Logo } from '@/components/compartido/Logo';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TeoLabsCredit } from '@/components/compartido/TeoLabsCredit';

export default function CustomerMenuLayout({ children }: { children: React.ReactNode }) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  return (
    <CartProvider storageKey={tenantSlug ? `hungryape:cart:${tenantSlug}` : undefined}>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur-md shadow-sm">
          <div className="container flex h-16 items-center justify-between px-6">
            <Logo />
            <Cart />
          </div>
        </header>
        {/* pb-28: room for the cart's fixed bottom bar */}
        <main className="flex-1 container px-4 py-6 pb-28">{children}</main>
        <footer className="border-t border-border py-6">
          <div className="container flex flex-col items-center justify-center gap-1">
            <span className="text-lg">🦍</span>
            <p className="text-sm text-muted-foreground">
              Hecho con <Link href="/" className="font-brand text-foreground hover:text-primary transition-colors">Hungry Ape</Link>
            </p>
            <TeoLabsCredit />
          </div>
        </footer>
      </div>
    </CartProvider>
  );
}

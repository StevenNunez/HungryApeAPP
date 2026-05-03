'use client';
import { CartProvider } from '@/context/CartContext';
import { Cart } from '@/components/carrito/Cart';
import { Logo } from '@/components/compartido/Logo';
import Link from 'next/link';

export default function CustomerMenuLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur-md shadow-sm">
          <div className="container flex h-16 items-center justify-between px-6">
            <Logo />
            <Cart />
          </div>
        </header>
        <main className="flex-1 container px-6 py-10">{children}</main>
        <footer className="border-t border-border py-6">
          <div className="container flex flex-col items-center justify-center gap-1">
            <span className="text-lg">🦍</span>
            <p className="text-sm text-muted-foreground">
              Powered by <Link href="/" className="font-brand text-foreground hover:text-primary transition-colors">Hungry Ape</Link>
            </p>
          </div>
        </footer>
      </div>
    </CartProvider>
  );
}

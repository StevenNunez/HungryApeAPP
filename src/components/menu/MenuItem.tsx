'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { MenuItem as MenuItemType } from '@/lib/types';
import { useCart } from '@/hooks/useCart';
import { PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCLP } from '@/lib/utils';

interface MenuItemProps {
  item: MenuItemType;
}

export function MenuItem({ item }: MenuItemProps) {
  const { addToCart, cartItems } = useCart();
  const { toast } = useToast();

  const cartItem = cartItems.find(i => i.id === item.id);
  const isInCart = !!cartItem;
  const isStockReached = cartItem ? cartItem.quantity >= item.stock : item.stock <= 0;

  const handleAddToCart = () => {
    if (isStockReached) return;
    addToCart(item);
    toast({
      title: `🦍 ¡Al carrito!`,
      description: `${item.name} fue añadido a tu pedido.`,
    });
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-primary/40 transition-all duration-300 ease-out">
      {/* Image */}
      <div className="relative h-48 w-full overflow-hidden">
        <Image
          src={item.imageUrl}
          alt={item.name}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          data-ai-hint={item.aiHint}
        />
        {(!item.isAvailable || item.stock <= 0) && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center">
            <Badge variant="destructive" className="text-sm px-3 py-1 font-semibold">
              Agotado
            </Badge>
          </div>
        )}
        {/* Price badge on image using CLP style */}
        <span className="absolute top-3 right-3 bg-primary text-primary-foreground text-sm font-bold px-3 py-1.5 rounded-full shadow-lg">
          {formatCLP(item.price)}
        </span>
        {/* Stock indicator */}
        {item.isAvailable && item.stock > 0 && item.stock <= 5 && (
          <span className="absolute top-3 left-3 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">
            ¡Quedan {item.stock}!
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 gap-3">
        <div className="flex-1">
          <h3 className="font-headline text-lg tracking-wide leading-snug">{item.name}</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed line-clamp-2">
            {item.description}
          </p>
        </div>

        <Button
          id={`add-to-cart-${item.id}`}
          onClick={handleAddToCart}
          disabled={!item.isAvailable || item.stock <= 0 || isStockReached}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-2 rounded-xl transition-all active:scale-95"
          aria-label={`Añadir ${item.name} al carrito`}
        >
          <PlusCircle className="h-4 w-4" />
          {isStockReached ? 'Límite alcanzado' : 'Añadir al pedido'}
        </Button>
      </div>
    </div>
  );
}

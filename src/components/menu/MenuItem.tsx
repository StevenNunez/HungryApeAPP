'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { MenuItem as MenuItemType, ModifierGroup, SelectedModifier } from '@/lib/types';
import { useCart } from '@/hooks/useCart';
import { PlusCircle, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCLP } from '@/lib/utils';

interface MenuItemProps {
  item: MenuItemType;
  groups?: ModifierGroup[];
}

export function MenuItem({ item, groups = [] }: MenuItemProps) {
  const { addToCart, cartItems } = useCart();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  const inCartCount = cartItems
    .filter(i => i.id === item.id)
    .reduce((sum, i) => sum + i.quantity, 0);
  const isStockReached = inCartCount >= item.stock || item.stock <= 0;

  const handleAddClick = () => {
    if (!item.isAvailable || isStockReached) return;
    if (groups.length > 0) {
      setSelections({});
      setDialogOpen(true);
    } else {
      doAddToCart([]);
    }
  };

  const doAddToCart = (modifiers: SelectedModifier[]) => {
    addToCart(item, modifiers);
    const extra = modifiers.length > 0
      ? ` · ${modifiers.map(m => m.optionName).join(', ')}`
      : '';
    toast({
      title: '🦍 ¡Al carro!',
      description: `${item.name}${extra} fue agregado a tu pedido.`,
    });
  };

  const toggleOption = (groupId: string, optionId: string, type: 'checkbox' | 'radio') => {
    setSelections(prev => {
      if (type === 'radio') {
        return { ...prev, [groupId]: [optionId] };
      }
      const current = prev[groupId] || [];
      const exists = current.includes(optionId);
      return { ...prev, [groupId]: exists ? current.filter(id => id !== optionId) : [...current, optionId] };
    });
  };

  const handleConfirm = () => {
    for (const group of groups) {
      if (group.required && (!selections[group.id] || selections[group.id].length === 0)) {
        toast({ title: `Elige una opción en "${group.name}"`, variant: 'destructive' });
        return;
      }
    }

    const modifiers: SelectedModifier[] = [];
    for (const group of groups) {
      for (const optionId of selections[group.id] || []) {
        const option = group.options.find(o => o.id === optionId);
        if (option) {
          modifiers.push({
            optionId: option.id,
            optionName: option.name,
            groupName: group.name,
            priceDelta: option.priceDelta,
          });
        }
      }
    }

    doAddToCart(modifiers);
    setDialogOpen(false);
  };

  const extraTotal = groups.reduce((sum, group) => {
    return sum + (selections[group.id] || []).reduce((s, optId) => {
      const opt = group.options.find(o => o.id === optId);
      return s + (opt?.priceDelta ?? 0);
    }, 0);
  }, 0);

  return (
    <>
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
          <span className="absolute top-3 right-3 bg-primary text-primary-foreground text-sm font-bold px-3 py-1.5 rounded-full shadow-lg">
            {formatCLP(item.price)}
          </span>
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
            {groups.length > 0 && (
              <p className="text-xs text-primary/70 mt-1.5 font-medium">
                Personalizable ·{' '}
                {groups.map(g => g.name).join(', ')}
              </p>
            )}
          </div>

          <Button
            id={`add-to-cart-${item.id}`}
            onClick={handleAddClick}
            disabled={!item.isAvailable || item.stock <= 0 || isStockReached}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-2 rounded-xl transition-all active:scale-95"
            aria-label={`Agregar ${item.name} al carrito`}
          >
            <PlusCircle className="h-4 w-4" />
            {isStockReached ? 'Límite alcanzado' : groups.length > 0 ? 'Personalizar y agregar' : 'Agregar al pedido'}
          </Button>
        </div>
      </div>

      {/* Modifier Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/60">
            <DialogTitle className="font-brand text-xl uppercase tracking-wide">{item.name}</DialogTitle>
            <p className="text-sm text-muted-foreground">Personaliza tu pedido</p>
          </DialogHeader>

          <div className="overflow-y-auto max-h-[60vh] px-6 py-4 space-y-5">
            {groups.map(group => (
              <div key={group.id}>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-sm font-bold uppercase tracking-wider">{group.name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase">
                    {group.required ? 'Requerido' : 'Opcional'}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {group.options.map(option => {
                    const isSelected = (selections[group.id] || []).includes(option.id);
                    return (
                      <button
                        key={option.id}
                        onClick={() => toggleOption(group.id, option.id, group.type)}
                        className={`w-full flex items-center justify-between rounded-xl px-4 py-3 border-2 transition-all text-sm ${
                          isSelected
                            ? 'border-primary bg-primary/8 text-foreground'
                            : 'border-border bg-card text-foreground hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0 transition-colors ${
                            isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                          }`}>
                            {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          <span className="font-medium">{option.name}</span>
                        </div>
                        {option.priceDelta !== 0 && (
                          <span className={`text-xs font-bold ${option.priceDelta > 0 ? 'text-primary' : 'text-green-500'}`}>
                            {option.priceDelta > 0 ? '+' : ''}{formatCLP(option.priceDelta)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="px-6 pb-6 pt-3 border-t border-border/60">
            <Button
              onClick={handleConfirm}
              className="w-full h-12 rounded-2xl font-bold gap-2 bg-primary text-primary-foreground"
            >
              <PlusCircle className="h-4 w-4" />
              Agregar al pedido
              {extraTotal > 0 && <span className="font-normal opacity-80">· +{formatCLP(extraTotal)}</span>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

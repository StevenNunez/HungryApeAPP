'use client';

import { Order, OrderStatus } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

import { formatCLP } from '@/lib/utils';

interface OrderCardProps {
  order: Order;
  onStatusChange: (orderId: string, newStatus: OrderStatus) => void;
}

export function OrderCard({ order, onStatusChange }: OrderCardProps) {
  const nextStatus: OrderStatus | null =
    order.status === 'Por Pagar'
      ? 'Pendiente'
      : order.status === 'Pendiente'
      ? 'En preparación'
      : order.status === 'En preparación'
      ? 'Listo'
      : order.status === 'Listo'
      ? 'Entregado'
      : null;

  const isReady = order.status === 'Listo';
  const isPaying = order.status === 'Por Pagar';

  const paymentLabels: Record<string, string> = {
    cash: '💵 Efectivo',
    card: '💳 Tarjeta',
    transfer: '📱 Transferencia',
    qr: '📲 QR/App'
  };

  return (
    <Card className={`shadow-md animate-in fade-in-50 transition-all ${
      isReady ? 'border-accent border-2 shadow-lg' : isPaying ? 'border-red-400 border-2 shadow-lg' : 'bg-card'
    }`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex justify-between items-center">
          <span className="font-brand text-lg tracking-wide">{order.nickname}</span>
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-widest text-[10px]">
            {order.shortId ? `PEDIDO #${order.shortId}` : `#${order.id.slice(0, 8)}`}
          </span>
        </CardTitle>
        <CardDescription className="flex justify-between items-center">
          <span>{formatDistanceToNow(order.createdAt, { addSuffix: true, locale: es })}</span>
          <span className="font-bold text-xs bg-muted px-2 py-0.5 rounded-md">
            {paymentLabels[order.paymentMethod] || order.paymentMethod}
          </span>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* ── Pickup verification code (visible to kitchen) ── */}
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
          isReady
            ? 'bg-accent/20 border border-accent'
            : isPaying
            ? 'bg-red-500/10 border border-red-200'
            : 'bg-muted'
        }`}>
          <ShieldCheck className={`h-4 w-4 shrink-0 ${isReady ? 'text-accent-foreground' : isPaying ? 'text-red-500' : 'text-muted-foreground'}`} />
          <span className="text-xs font-medium text-muted-foreground">Código:</span>
          <span className={`font-brand text-2xl tracking-[0.2em] ${
            isReady ? 'text-foreground' : 'text-muted-foreground'
          }`}>
            {order.pickupCode}
          </span>
        </div>

        {/* ── Items list ── */}
        <ul className="space-y-2 text-sm">
          {order.items.map(item => (
            <li key={item.cartKey || item.id}>
              <div className="flex justify-between items-start gap-4">
                <span className="font-medium">{item.quantity}x {item.name}</span>
                <span className="text-muted-foreground tracking-tighter whitespace-nowrap">{formatCLP(item.quantity * item.price)}</span>
              </div>
              {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 pl-4">
                  {item.selectedModifiers.map((mod, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                    >
                      {mod.optionName}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="border-t border-dashed my-3"></div>
        <div className="flex justify-between font-brand text-lg tracking-tight">
          <span>Total:</span>
          <span className={`${isPaying ? 'text-red-500' : 'text-primary'}`}>{formatCLP(order.total)}</span>
        </div>
      </CardContent>

      {nextStatus && (
        <CardFooter>
          <Button
            className={`w-full ${isReady ? 'bg-accent text-accent-foreground hover:bg-accent/90' : isPaying ? 'bg-red-500 hover:bg-red-600 text-white' : ''}`}
            onClick={() => onStatusChange(order.id, nextStatus)}
          >
            {nextStatus === 'Pendiente' ? (
              <>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Confirmar Pago
              </>
            ) : nextStatus === 'Entregado' ? (
              <>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Verificar y Entregar
              </>
            ) : nextStatus === 'Listo' ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Marcar como Listo
              </>
            ) : (
              <>
                <ArrowRight className="mr-2 h-4 w-4" />
                Mover a {nextStatus}
              </>
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

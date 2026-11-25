'use client';

import { Order, OrderStatus } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ArrowRight, Check, ShieldCheck, UtensilsCrossed, ShoppingBag, Loader2, XCircle, Undo2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

import { formatCLP } from '@/lib/utils';

interface OrderCardProps {
  order: Order;
  onStatusChange: (orderId: string, newStatus: OrderStatus) => void;
  /** True while a change to this order is being saved: buttons are locked. */
  saving?: boolean;
  /** The last tap on this card hasn't been sent yet and can be undone. */
  undoable?: boolean;
  undoSeconds?: number;
  onUndo?: (orderId: string) => void;
}

export function OrderCard({ order, onStatusChange, saving = false, undoable = false, undoSeconds = 5, onUndo }: OrderCardProps) {
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
  // Only what hasn't started cooking can be voided (its stock goes back to the menu)
  const canCancel = order.status === 'Por Pagar' || order.status === 'Pendiente';

  const paymentLabels: Record<string, string> = {
    cash: '💵 Efectivo',
    card: '💳 Tarjeta',
    transfer: '📱 Transferencia',
    qr: '📲 QR/App',
    online: '🌐 Pago online'
  };

  const isLlevar = order.orderType === 'llevar';

  return (
    <Card className={`shadow-md animate-in fade-in-50 transition-all ${
      isReady ? 'border-accent border-2 shadow-lg' : isPaying ? 'border-red-400 border-2 shadow-lg' : 'bg-card'
    }`}>
      {/* Order type banner */}
      <div className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider ${
        isLlevar
          ? 'bg-blue-500/15 text-blue-800 dark:text-blue-400'
          : 'bg-green-500/15 text-green-800 dark:text-green-400'
      }`}>
        {isLlevar
          ? <><ShoppingBag className="h-3.5 w-3.5" /> Para llevar</>
          : <><UtensilsCrossed className="h-3.5 w-3.5" /> Comer aquí</>
        }
      </div>

      <CardHeader className="pb-2">
        <CardTitle className="flex flex-col gap-0.5">
          <div className="flex justify-between items-center gap-2">
            <span className="font-brand text-lg tracking-wide truncate min-w-0">{order.nickname}</span>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0 bg-muted px-2 py-0.5 rounded-md whitespace-nowrap">
              {order.shortId ? `#${order.shortId}` : `#${order.id.slice(0, 6)}`}
            </span>
          </div>
        </CardTitle>
        <CardDescription className="flex justify-between items-center">
          <span>{formatDistanceToNow(order.createdAt, { addSuffix: true, locale: es })}</span>
          <span className="font-bold text-xs bg-muted px-2 py-0.5 rounded-md">
            {paymentLabels[order.paymentMethod] || order.paymentMethod}
            {order.paymentMethod === 'online' && (order.paidOnline ? ' · ✅ pagado' : ' · esperando pago')}
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
          <ShieldCheck className={`h-4 w-4 shrink-0 ${isReady ? 'text-accent-foreground' : isPaying ? 'text-red-700' : 'text-muted-foreground'}`} />
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
                      className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
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
          <span className={`${isPaying ? 'text-red-700' : 'text-primary'}`}>{formatCLP(order.total)}</span>
        </div>
      </CardContent>

      {undoable && onUndo && (
        <CardFooter className="flex flex-col gap-1">
          <Button
            variant="outline"
            className="w-full min-h-11 border-2 border-foreground/70 font-bold"
            onClick={() => onUndo(order.id)}
          >
            <Undo2 className="mr-2 h-4 w-4" />
            Deshacer
          </Button>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className="h-full bg-foreground/60 origin-left"
              style={{ animation: `ha-undo-countdown ${undoSeconds}s linear forwards` }}
            />
          </div>
          <span className="sr-only">Se guarda en {undoSeconds} segundos</span>
        </CardFooter>
      )}

      {nextStatus && !undoable && (
        <CardFooter className="flex flex-col gap-2">
          <Button
            disabled={saving}
            className={`w-full min-h-11 ${isReady ? 'bg-accent text-accent-foreground hover:bg-accent/90' : isPaying ? 'bg-red-700 hover:bg-red-800 text-white' : ''}`}
            onClick={() => onStatusChange(order.id, nextStatus)}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : nextStatus === 'Pendiente' ? (
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

          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={saving} className="w-full min-h-11 text-muted-foreground hover:text-red-800">
                  <XCircle className="mr-2 h-4 w-4" />
                  Anular pedido
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Anular el pedido de {order.nickname}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Sale de la cocina y sus productos vuelven al stock. No se puede deshacer.
                    {order.paidOnline && ' Este pedido ya se pagó online: la devolución se hace desde Mercado Pago.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Volver</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-700 text-white hover:bg-red-800"
                    onClick={() => onStatusChange(order.id, 'Cancelado')}
                  >
                    Sí, anular
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

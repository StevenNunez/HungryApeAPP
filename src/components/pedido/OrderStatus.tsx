'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Order, OrderStatus as OrderStatusType } from '@/lib/types';
import { getOrderById, subscribeToOrder } from '@/lib/data';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, CookingPot, PackageCheck, ShieldCheck, Banknote, CreditCard, ArrowRight, Smartphone, AlertCircle } from 'lucide-react';
import { formatCLP } from '@/lib/utils';

const statusSteps: OrderStatusType[] = ['Pendiente', 'En preparación', 'Listo'];

const statusInfo: Record<OrderStatusType, { icon: any; text: string; color: string; bgColor: string }> = {
  'Por Pagar': {
    icon: Banknote,
    text: 'Esperando confirmación de pago...',
    color: 'text-red-500',
    bgColor: 'bg-red-500',
  },
  'Pendiente': {
    icon: Clock,
    text: 'Tu pedido ha sido recibido y está en cola.',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500',
  },
  'En preparación': {
    icon: CookingPot,
    text: '¡Estamos preparando tu comida!',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500',
  },
  'Listo': {
    icon: PackageCheck,
    text: '¡Tu pedido está listo! Muestra tu código al retirar.',
    color: 'text-accent',
    bgColor: 'bg-accent',
  },
  'Entregado': {
    icon: ShieldCheck,
    text: '¡Entregado! Buen provecho 🦍',
    color: 'text-green-500',
    bgColor: 'bg-green-500',
  },
};

import { useToast } from '@/hooks/use-toast';

export function OrderStatus({ orderId }: { orderId: string }) {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const pickupCodeFromUrl = searchParams.get('code');

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch order from Supabase
  useEffect(() => {
    getOrderById(orderId).then(data => {
      if (data && pickupCodeFromUrl) {
        data.pickupCode = pickupCodeFromUrl;
      }
      setOrder(data);
      setLoading(false);
    });
  }, [orderId, pickupCodeFromUrl]);

  // Realtime subscription — auto-update when kitchen changes status
  useEffect(() => {
    if (!orderId || !order) return;

    console.log(`🦍 Subscribing to order tracking: ${orderId}`);

    const unsubscribe = subscribeToOrder(orderId, (updatedRow) => {
      console.log('📦 Status update received:', updatedRow.status);
      
      const newStatus = updatedRow.status as OrderStatusType;
      
      setOrder(prev => {
        if (!prev) return null;
        return { ...prev, status: newStatus };
      });

      if (newStatus === 'Listo') {
        // Notification sound could be added here
        toast({
          title: '🔥 ¡TU PEDIDO ESTÁ LISTO!',
          description: 'Acércate a caja con tu código para retirar.',
          variant: 'default',
        });
      }
    });

    return unsubscribe;
  }, [orderId, order?.id, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-muted-foreground">Cargando tu pedido...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20">
        <span className="text-6xl mb-4 block">🦍</span>
        <p className="text-xl font-semibold">No se encontró el pedido.</p>
      </div>
    );
  }

  const currentStatusIndex = statusSteps.indexOf(order.status);
  const currentStatus = statusInfo[order.status];
  const Icon = currentStatus.icon;
  const isReady = order.status === 'Listo';
  const isPaying = order.status === 'Por Pagar';

  const renderPaymentInstructions = () => {
    switch (order.paymentMethod) {
      case 'cash':
        return (
          <div className="bg-amber-500/10 border-2 border-amber-500/30 p-6 rounded-2xl text-center space-y-4">
            <div className="w-16 h-16 bg-amber-500/20 text-amber-600 rounded-full flex items-center justify-center mx-auto">
              <Banknote className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-amber-600">Falta el Pago en Efectivo</h3>
            <p className="text-muted-foreground text-sm">
              Por favor, **dirígete a la caja** con tu código de retiro para pagar {formatCLP(order.total)}. Empezaremos a cocinar en cuanto confirmemos el pago.
            </p>
          </div>
        );
      case 'card':
        return (
          <div className="bg-blue-500/10 border-2 border-blue-500/30 p-6 rounded-2xl text-center space-y-4">
            <div className="w-16 h-16 bg-blue-500/20 text-blue-600 rounded-full flex items-center justify-center mx-auto">
              <CreditCard className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-blue-600">Falta el Pago con Tarjeta</h3>
            <p className="text-muted-foreground text-sm">
              Por favor, **dirígete a la caja** con tu código de retiro para acercar tu tarjeta y abonar {formatCLP(order.total)}. Empezaremos a cocinar en cuanto pagues.
            </p>
          </div>
        );
      case 'transfer':
        return (
          <div className="bg-accent/10 border-2 border-accent/30 p-6 rounded-2xl text-center space-y-4">
            <div className="w-16 h-16 bg-accent/20 text-accent rounded-full flex items-center justify-center mx-auto">
              <ArrowRight className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-accent">Paga mediante Transferencia</h3>
            <p className="text-muted-foreground text-sm">
              Transfiere **{formatCLP(order.total)}** a la cuenta del local y **muestra el comprobante en caja** para que empecemos a cocinar.
            </p>
            {order.transferDetails?.bank ? (
              <div className="bg-background/80 rounded-xl p-5 text-left mt-4 text-sm font-medium border border-border shadow-sm space-y-2">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Banco:</span>
                  <span className="font-bold">{order.transferDetails.bank}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Tipo de Cuenta:</span>
                  <span className="font-bold">{order.transferDetails.accountType}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">N° Cuenta:</span>
                  <span className="font-bold font-mono tracking-wider">{order.transferDetails.accountNumber}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">RUT:</span>
                  <span className="font-bold font-mono tracking-wider">{order.transferDetails.rut}</span>
                </div>
                {order.transferDetails.email && (
                  <div className="flex justify-between pt-1">
                    <span className="text-muted-foreground">Correo:</span>
                    <span className="font-bold text-primary">{order.transferDetails.email}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-background rounded-lg p-4 text-left mt-4 text-sm font-medium border">
                <p>Por favor, pide los datos de transferencia en caja.</p>
              </div>
            )}
          </div>
        );
      case 'qr':
      default:
        return (
          <div className="bg-muted border-2 p-6 rounded-2xl text-center space-y-4">
            <div className="w-16 h-16 bg-background rounded-full flex items-center justify-center mx-auto">
              <Smartphone className="w-8 h-8 text-foreground" />
            </div>
            <h3 className="text-xl font-bold">Verificando Pago Online...</h3>
            <p className="text-muted-foreground text-sm">
              Si ya completaste el pago en la aplicación, por favor avisa a la caja o espera a que el sistema procese tu pago.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="text-center">
        <h1 className="text-3xl sm:text-4xl font-brand tracking-wide">
          ¡Gracias, <span className="text-primary">{order.nickname}</span>!
        </h1>
        <p className="text-sm text-muted-foreground mt-1 font-medium">
          Pedido {order.shortId ? `#${order.shortId}` : `#${order.id.slice(0, 8)}`}
        </p>
      </div>

      {/* ══════════════ PICKUP CODE — THE STAR ══════════════ */}
      <Card className={`overflow-hidden border-2 transition-all duration-500 ${
        isReady ? 'border-accent ha-glow-yellow animate-pulse' : 'border-border'
      }`}>
        <div className={`px-4 py-2 flex items-center gap-2 text-sm font-medium ${
          isReady ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
        }`}>
          <ShieldCheck className="h-4 w-4" />
          {isReady ? 'MUESTRA ESTE CÓDIGO PARA RETIRAR' : 'TU CÓDIGO DE RETIRO'}
        </div>
        <CardContent className="py-8 text-center">
          <div className="relative inline-block">
            <span
              className={`font-brand text-7xl sm:text-8xl tracking-[0.3em] select-all transition-colors duration-500 ${
                isReady ? 'text-foreground' : 'text-foreground/80'
              }`}
            >
              {order.pickupCode}
            </span>
            {isReady && (
              <span
                className="absolute -inset-x-6 -inset-y-2 bg-accent/20 rounded-2xl -z-10 animate-pulse"
                aria-hidden="true"
              />
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            {isReady
              ? '🍌 Tu pedido está listo — muestra este código al personal'
              : 'Guarda este código, te lo pedirán al retirar'}
          </p>
        </CardContent>
      </Card>

      {/* ── Status or Payment Instruction ── */}
      {isPaying ? (
        renderPaymentInstructions()
      ) : (
        <>
          <Card>
            <CardContent className="py-6">
              <div className="flex flex-col items-center gap-4">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${currentStatus.bgColor}/15`}>
                  <Icon className={`w-10 h-10 ${currentStatus.color} transition-all duration-500`} />
                </div>
                <p className="text-center font-semibold text-lg">{currentStatus.text}</p>
              </div>
            </CardContent>
          </Card>

          {/* ── Progress stepper ── */}
          <Card>
            <CardContent className="py-6">
              <div className="flex items-center justify-between px-2">
                {statusSteps.map((step, index) => {
                  const StepIcon = statusInfo[step].icon;
                  const isActive = index <= currentStatusIndex;
                  const isCurrent = index === currentStatusIndex;
                  return (
                    <div key={step} className="flex flex-col items-center gap-2 relative">
                      {index > 0 && (
                        <div
                          className={`absolute top-5 h-0.5 transition-colors duration-500 ${
                            isActive ? 'bg-primary' : 'bg-border'
                          }`}
                          style={{ width: '60px', left: '-45px' }}
                        />
                      )}
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 z-10 ${
                          isCurrent
                            ? 'bg-primary border-primary text-primary-foreground scale-110 shadow-lg'
                            : isActive
                            ? 'bg-primary/80 border-primary text-primary-foreground'
                            : 'bg-muted border-border text-muted-foreground'
                        }`}
                      >
                        <StepIcon className="w-5 h-5" />
                      </div>
                      <span
                        className={`text-xs font-medium text-center ${
                          isActive ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      >
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Reminder ── */}
      <div className="text-center text-xs text-muted-foreground px-4">
        <p>🦍 No compartas tu código — es tu comprobante para retirar tu pedido.</p>
      </div>
    </div>
  );
}

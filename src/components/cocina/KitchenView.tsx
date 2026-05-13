'use client';

import { useState, useEffect } from 'react';
import type { Order, OrderStatus } from '@/lib/types';
import { getOrdersByTenant, updateOrderStatus as updateStatus, subscribeToOrders } from '@/lib/data';
import { OrderCard } from './OrderCard';
import { useToast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';

const mainColumns: OrderStatus[] = ['Por Pagar', 'Pendiente', 'En preparación', 'Listo'];

const columnColors: Record<OrderStatus, string> = {
  'Por Pagar': 'bg-red-500/10 border-red-500/30',
  'Pendiente': 'bg-amber-500/10 border-amber-500/30',
  'En preparación': 'bg-blue-500/10 border-blue-500/30',
  'Listo': 'bg-accent/10 border-accent/30',
  'Entregado': 'bg-green-500/10 border-green-500/30',
};

interface KitchenViewProps {
  tenantSlug: string;
  compact?: boolean;
}

export function KitchenView({ tenantSlug, compact = false }: KitchenViewProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const { toast } = useToast();

  // Initial fetch using the dynamic slug
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', tenantSlug)
        .single();

      if (tenant) {
        setTenantId(tenant.id);
        const data = await getOrdersByTenant(tenantSlug);
        setOrders(data);
      }
      setLoading(false);
    }
    load();
  }, [tenantSlug]);

  // Realtime subscription — now correctly using the tenant's actual ID
  useEffect(() => {
    if (!tenantId) return;

    console.log(`🦍 Subscribing to kitchen realtime for tenant: ${tenantId}`);

    const unsubscribe = subscribeToOrders(
      tenantId,
      // New order
      // New order: we wait 1s to allow order_items to be fully inserted in Supabase, then fetch them all
      (newRow) => {
        setTimeout(async () => {
          const freshOrders = await getOrdersByTenant(tenantSlug);
          setOrders(freshOrders);
          toast({
            title: '🦍 ¡Nuevo Pedido!',
            description: `${newRow.nickname || 'Cliente'} — Código: ${newRow.pickup_code}`,
          });
        }, 1000);
      },
      // Order status updated by someone else or system
      (updatedRow) => {
        setOrders(prev =>
          prev.map(order =>
            order.id === updatedRow.id
              ? { ...order, status: updatedRow.status as OrderStatus }
              : order
          )
        );
      },
    );

    return unsubscribe;
  }, [tenantId, toast]);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    // 1. Optimistic update (UI changes immediately)
    setOrders(prev =>
      prev.map(order =>
        order.id === orderId ? { ...order, status: newStatus } : order
      )
    );

    try {
      // 2. Persist to Supabase Database
      await updateStatus(orderId, newStatus);
      
      if (newStatus === 'Entregado') {
        toast({
          title: '✅ Pedido entregado',
          description: `El cliente ya puede disfrutar su comida.`,
        });
      } else {
        toast({
          title: `Estado: ${newStatus}`,
          duration: 2000,
        });
      }
    } catch (err: any) {
      console.error('Failed to update order in DB:', err);
      // 3. Revert on error
      toast({
        title: 'Error de conexión',
        description: 'No pudimos guardar el cambio en la base de datos.',
        variant: 'destructive',
      });
      // Refresh to get actual DB state
      const data = await getOrdersByTenant(tenantSlug);
      setOrders(data);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
        <p className="text-muted-foreground font-brand uppercase tracking-widest text-xs">Sincronizando cocina...</p>
      </div>
    );
  }

  const entregados = orders.filter(o => o.status === 'Entregado').slice(-10); // Keep only last 10

  return (
    <div className="space-y-12 animate-in fade-in duration-500 pb-20">
      {/* ── Active Kitchen Board (Main columns) ── */}
      <div className={`grid gap-6 items-start ${compact ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'}`}>
        {mainColumns.map(status => {
          const statusOrders = orders.filter(o => o.status === status);
          const orderCount = statusOrders.length;
          
          return (
            <div 
              key={status} 
              className={`rounded-[2.5rem] p-5 h-full min-h-[400px] border-2 transition-all duration-300 ${columnColors[status] || 'bg-muted border-border/50'} ${orderCount > 0 ? 'shadow-lg' : 'opacity-70 hover:opacity-100'}`}
            >
              <div className="flex items-center justify-between mb-6 px-1">
                <div className="flex flex-col">
                  <h2 className="text-sm font-bold uppercase tracking-tighter text-foreground/70">{status}</h2>
                  <div className="h-1 w-8 bg-primary/40 rounded-full mt-1" />
                </div>
                <Badge variant="secondary" className="rounded-lg font-brand text-lg px-2.5 py-0.5 bg-background shadow-sm border-0">
                  {orderCount}
                </Badge>
              </div>

              <div className="space-y-4 min-h-[100px]">
                {statusOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onStatusChange={handleStatusChange}
                  />
                ))}
                {orderCount === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-foreground/5 rounded-3xl">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Vacío</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Recently Completed (Entregados) Zone ── */}
      {entregados.length > 0 && (
        <div className="border-t border-border pt-10 mt-10">
          <div className="flex items-center gap-4 mb-6">
            <h2 className="font-brand text-2xl uppercase tracking-wider text-muted-foreground">Últimos Entregados</h2>
            <span className="text-xs font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full">Max 10 result.</span>
          </div>
          <div className={`grid gap-4 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
            {entregados.reverse().map(order => (
              <div key={order.id} className="opacity-70 hover:opacity-100 transition-opacity grayscale hover:grayscale-0">
                <OrderCard order={order} onStatusChange={handleStatusChange} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { Badge } from '../ui/badge';
import { Loader2 } from 'lucide-react';

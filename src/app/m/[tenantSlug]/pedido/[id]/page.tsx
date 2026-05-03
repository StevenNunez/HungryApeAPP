import { Suspense } from 'react';
import { OrderStatus } from '@/components/pedido/OrderStatus';

export default async function TenantOrderStatusPage({ params }: { params: Promise<{ tenantSlug: string; id: string }> }) {
  const { id } = await params;

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    }>
      <OrderStatus orderId={id} />
    </Suspense>
  );
}

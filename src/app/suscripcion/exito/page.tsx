'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function SuccessContent() {
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan') || 'starter';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-80 h-80 bg-green-500/10 rounded-full blur-3xl" />
      </div>

      <Card className="max-w-md w-full text-center border-accent/50 shadow-2xl">
        <CardContent className="py-12 space-y-6">
          <div className="w-20 h-20 bg-green-500/15 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          </div>

          <div>
            <h1 className="font-brand text-3xl tracking-wide text-foreground">
              ¡PAGO EXITOSO!
            </h1>
            <p className="text-muted-foreground mt-2">
              Tu suscripción al plan <strong className="text-foreground capitalize">{plan}</strong> ha sido activada.
            </p>
          </div>

          <div className="bg-accent/10 rounded-xl p-4 text-sm text-muted-foreground">
            <p>🦍 Tu food truck digital está listo.</p>
            <p className="mt-1">Ya puedes subir tu menú, generar tu QR y empezar a recibir pedidos.</p>
          </div>

          <Link href="/dashboard">
            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl py-5 gap-2">
              Ir a mi Dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SubscriptionSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}

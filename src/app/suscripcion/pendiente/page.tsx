'use client';

import Link from 'next/link';
import { Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function SubscriptionPendingPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full text-center border-amber-500/30 shadow-2xl">
        <CardContent className="py-12 space-y-6">
          <div className="w-20 h-20 bg-amber-500/15 rounded-full flex items-center justify-center mx-auto">
            <Clock className="w-12 h-12 text-amber-500" />
          </div>

          <div>
            <h1 className="font-brand text-3xl tracking-wide text-foreground">
              PAGO PENDIENTE
            </h1>
            <p className="text-muted-foreground mt-2">
              Tu pago está siendo procesado. Te notificaremos cuando se confirme.
            </p>
          </div>

          <div className="bg-amber-500/10 rounded-xl p-4 text-sm text-muted-foreground">
            <p>Esto puede tomar unos minutos si pagaste con transferencia o medios offline.</p>
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

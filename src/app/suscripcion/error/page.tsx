'use client';

import Link from 'next/link';
import { XCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function SubscriptionErrorPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full text-center border-destructive/30 shadow-2xl">
        <CardContent className="py-12 space-y-6">
          <div className="w-20 h-20 bg-destructive/15 rounded-full flex items-center justify-center mx-auto">
            <XCircle className="w-12 h-12 text-destructive" />
          </div>

          <div>
            <h1 className="font-brand text-3xl tracking-wide text-foreground">
              PAGO NO COMPLETADO
            </h1>
            <p className="text-muted-foreground mt-2">
              Hubo un problema con tu pago. No se realizó ningún cargo.
            </p>
          </div>

          <div className="space-y-3">
            <Link href="/#pricing">
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl py-5 gap-2">
                <ArrowLeft className="h-4 w-4" />
                Intentar de nuevo
              </Button>
            </Link>
            <Link href="/" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
              Volver al inicio
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

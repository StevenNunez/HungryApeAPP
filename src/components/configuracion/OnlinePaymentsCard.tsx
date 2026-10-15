'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Globe, Loader2, LockKeyhole, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface Status {
  available: boolean;
  eligible: boolean;
  connected: boolean;
  mpUserId: string | null;
  connectedAt: string | null;
}

const RESULT_MESSAGES: Record<string, { title: string; description: string; variant?: 'destructive' }> = {
  conectado: { title: '✅ Mercado Pago conectado', description: 'Tus clientes ya pueden pagar online. El dinero llega directo a tu cuenta.' },
  cancelado: { title: 'Conexión cancelada', description: 'No se conectó ninguna cuenta.' },
  error: { title: 'No se pudo conectar', description: 'Inténtalo de nuevo en unos minutos.', variant: 'destructive' },
  'requiere-pro': { title: 'Disponible en el Plan Pro', description: 'Sube a Pro para cobrar online.', variant: 'destructive' },
  'no-disponible': { title: 'Pagos online no disponibles', description: 'Esta función aún no está habilitada en el servidor.', variant: 'destructive' },
};

/** Connect / disconnect the business' own Mercado Pago account for online payments (Pro). */
export function OnlinePaymentsCard() {
  const { toast } = useToast();
  const params = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/payments/status');
      if (res.ok) setStatus(await res.json());
    } catch { /* leave the card in its loading state */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Message after coming back from Mercado Pago (?pagos=conectado|error|...)
  useEffect(() => {
    const result = params.get('pagos');
    if (result && RESULT_MESSAGES[result]) toast(RESULT_MESSAGES[result]);
  }, [params, toast]);

  const disconnect = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/payments/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error();
      toast({ title: 'Cuenta desconectada', description: 'Ya no se ofrecerá el pago online a tus clientes.' });
      await load();
    } catch {
      toast({ title: 'No se pudo desconectar', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <Card className="rounded-[2.5rem] border-transparent shadow-xl bg-card">
        <CardContent className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-[2.5rem] border-transparent shadow-xl bg-card overflow-hidden">
      <CardHeader className="bg-muted/50 p-8 border-b border-border">
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-primary" />
          <CardTitle className="text-xl font-brand uppercase text-primary">Pagos online</CardTitle>
        </div>
        <CardDescription>
          Tus clientes pagan con tarjeta o Mercado Pago desde su celular. El dinero llega directo a tu cuenta de Mercado Pago;
          Mercado Pago te cobra su comisión por cada pago.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-8 space-y-4">
        {!status.eligible ? (
          <div className="flex items-start gap-3 bg-muted rounded-2xl p-4">
            <LockKeyhole className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold">Disponible en el Plan Pro</p>
              <p className="text-muted-foreground text-xs mt-1">
                <Link href="/#pricing" className="underline text-primary">Ver planes</Link>
              </p>
            </div>
          </div>
        ) : !status.available ? (
          <p className="text-sm text-muted-foreground">
            Los pagos online se están habilitando en la plataforma. Te avisaremos cuando puedas conectar tu cuenta.
          </p>
        ) : status.connected ? (
          <>
            <div className="flex items-center gap-2 text-green-600 font-bold text-sm">
              <CheckCircle2 className="h-5 w-5" /> Cuenta de Mercado Pago conectada
              {status.mpUserId && <span className="text-xs font-normal text-muted-foreground">(ID {status.mpUserId})</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              En el carrito de tus clientes aparece la opción <strong>Pagar online</strong>. Los pedidos pagados pasan solos a la cocina.
            </p>
            <Button variant="outline" onClick={disconnect} disabled={busy} className="rounded-xl">
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Unplug className="h-4 w-4 mr-2" />}
              Desconectar
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Conecta tu cuenta de Mercado Pago para empezar a cobrar online. Necesitas una cuenta de vendedor verificada.
            </p>
            <Button asChild className="rounded-xl font-bold">
              <a href="/api/payments/connect/start">Conectar Mercado Pago</a>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

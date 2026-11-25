'use client';

import { useState } from 'react';
import { Banknote, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCLP } from '@/lib/utils';
import { fmtDate, parseAmount, type CashSession } from '@/lib/caja';

interface Props {
  busy: boolean;
  lastClosed: CashSession | null;
  onOpen: (openingAmount: number) => void;
}

export function OpenCashForm({ busy, lastClosed, onOpen }: Props) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    const amount = raw.trim() === '' ? 0 : parseAmount(raw);
    if (amount === null || amount < 0) {
      setError('Escribe un monto válido (puede ser 0).');
      return;
    }
    setError('');
    onOpen(amount);
  };

  return (
    <div className="max-w-md mx-auto">
      <Card className="border-border">
        <CardHeader className="text-center pb-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Banknote className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Iniciar Caja</CardTitle>
          <CardDescription>Registra el monto inicial en efectivo antes de comenzar a vender.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div>
            <label htmlFor="caja-apertura" className="text-sm font-medium mb-1.5 block">Efectivo inicial en caja (CLP)</label>
            <Input
              id="caja-apertura"
              inputMode="numeric"
              placeholder="Ej: 50000"
              value={raw}
              onChange={e => setRaw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              aria-invalid={!!error}
              aria-describedby="caja-apertura-ayuda"
              className="text-lg h-12"
            />
            <p id="caja-apertura-ayuda" className={`text-xs mt-1.5 ${error ? 'text-red-700 font-semibold' : 'text-muted-foreground'}`}>
              {error || 'Billetes y monedas con que arrancas el día. Puede ser $0.'}
            </p>
          </div>
          <Button className="w-full h-12 text-base font-bold" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Abrir Caja
          </Button>
        </CardContent>
      </Card>
      {lastClosed && (
        <p className="text-center text-xs text-muted-foreground mt-4">
          Última caja: {fmtDate(lastClosed.opened_at)} · cierre {formatCLP(Number(lastClosed.closing_amount ?? 0))}
        </p>
      )}
    </div>
  );
}

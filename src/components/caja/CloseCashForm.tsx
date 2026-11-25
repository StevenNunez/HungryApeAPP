'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCLP } from '@/lib/utils';
import { PAY_LABELS, computeArqueo, parseAmount, type CajaOrder, type CashSession, type Withdrawal } from '@/lib/caja';
import { DiffNote } from './OrdersTable';

interface Props {
  session: CashSession;
  orders: CajaOrder[];
  withdrawals: Withdrawal[];
  closing: boolean;
  onCancel: () => void;
  onClose: (countedCash: number, notes: string) => void;
}

/** Closing the register: summary of the session, cash count and surplus/shortage. */
export function CloseCashForm({ session, orders, withdrawals, closing, onCancel, onClose }: Props) {
  const [countedRaw, setCountedRaw] = useState('');
  const [notes, setNotes] = useState('');
  const counted = parseAmount(countedRaw);
  const { byMethod, total, totalWithdrawals, expectedCash, diff } = computeArqueo(session, orders, withdrawals, counted ?? 0);
  const hasCount = counted !== null && counted >= 0;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h2 className="text-2xl font-brand tracking-wide">Cerrar Caja</h2>
        <p className="text-muted-foreground text-sm mt-1">Cuenta el efectivo físico y confirma el cierre.</p>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground font-normal uppercase tracking-widest">Resumen de la sesión</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Apertura</span><span className="font-medium">{formatCLP(Number(session.opening_amount))}</span></div>
          {Object.entries(byMethod).filter(([, v]) => v > 0).map(([k, v]) => (
            <div key={k} className="flex justify-between"><span className="text-muted-foreground">+ {PAY_LABELS[k] ?? k}</span><span className="font-medium">{formatCLP(v)}</span></div>
          ))}
          {totalWithdrawals > 0 && (
            <div className="flex justify-between text-red-700"><span>− Egresos ({withdrawals.length})</span><span className="font-medium">-{formatCLP(totalWithdrawals)}</span></div>
          )}
          <div className="flex justify-between border-t border-border pt-2 mt-1"><span className="font-bold">Total ventas</span><span className="font-bold text-primary">{formatCLP(total)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Efectivo esperado en caja</span><span className="font-semibold text-green-800">{formatCLP(expectedCash)}</span></div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground font-normal uppercase tracking-widest">Arqueo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="cierre-contado" className="text-sm font-medium block mb-1.5">Efectivo físico contado (CLP)</label>
            <Input id="cierre-contado" inputMode="numeric" placeholder="Cuenta los billetes y monedas" value={countedRaw} onChange={e => setCountedRaw(e.target.value)} className="text-lg h-12" autoFocus />
          </div>

          {hasCount && (
            <div
              role="status"
              className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
                diff === 0 ? 'bg-green-500/10 border-green-500/20' : diff > 0 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-red-500/10 border-red-500/20'
              }`}
            >
              {diff === 0
                ? <CheckCircle2 className="h-5 w-5 text-green-800 shrink-0 mt-0.5" aria-hidden="true" />
                : <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${diff > 0 ? 'text-blue-800' : 'text-red-700'}`} aria-hidden="true" />}
              <div className="text-sm">
                <DiffNote diff={diff} />
                <p className="text-xs text-muted-foreground mt-0.5">
                  {diff === 0 && 'El efectivo contado coincide exactamente con lo esperado.'}
                  {diff > 0 && 'Hay más efectivo del esperado. Revisa si hubo cambio extra.'}
                  {diff < 0 && 'Hay menos del esperado. Verifica cobros en efectivo o egresos.'}
                </p>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="cierre-notas" className="text-sm font-medium block mb-1.5">Notas (opcional)</label>
            <Input id="cierre-notas" placeholder="Observaciones del cierre..." value={notes} onChange={e => setNotes(e.target.value)} className="h-11" />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1 min-h-12" onClick={onCancel} disabled={closing}>Volver</Button>
        <Button className="flex-1 min-h-12 font-bold" onClick={() => hasCount && onClose(counted!, notes)} disabled={closing || !hasCount}>
          {closing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Confirmar Cierre
        </Button>
      </div>
    </div>
  );
}

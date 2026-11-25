'use client';

import { useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, Smartphone, ArrowRightLeft, TrendingUp, MinusCircle, ReceiptText, Loader2, X, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCLP } from '@/lib/utils';
import { computeTotals, fmtTime, parseAmount, type CajaOrder, type CashSession, type Withdrawal } from '@/lib/caja';
import { OrdersTable } from './OrdersTable';

interface Props {
  session: CashSession;
  orders: CajaOrder[];
  withdrawals: Withdrawal[];
  withdrawing: boolean;
  onWithdraw: (amount: number, reason: string) => Promise<boolean>;
  onStartClose: () => void;
}

/** Open cash session: live sales by method, withdrawals and the orders of the session. */
export function LiveSession({ session, orders, withdrawals, withdrawing, onWithdraw, onStartClose }: Props) {
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amountRaw, setAmountRaw] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const { byMethod, total } = computeTotals(orders);
  const totalWithdrawals = withdrawals.reduce((s, w) => s + Number(w.amount), 0);

  const resetWithdraw = () => { setShowWithdraw(false); setAmountRaw(''); setReason(''); setError(''); };

  const submitWithdraw = async () => {
    const amount = parseAmount(amountRaw);
    if (!amount || amount <= 0) return setError('Ingresa un monto mayor a 0.');
    if (!reason.trim()) return setError('Escribe el motivo del egreso.');
    setError('');
    if (await onWithdraw(amount, reason.trim())) resetWithdraw();
  };

  const kpis = [
    { label: 'Efectivo', value: byMethod.cash, icon: Banknote, color: 'text-green-800', bg: 'bg-green-500/10' },
    { label: 'Transferencia', value: byMethod.transfer, icon: ArrowRightLeft, color: 'text-blue-800', bg: 'bg-blue-500/10' },
    { label: 'Tarjeta', value: byMethod.card, icon: CreditCard, color: 'text-purple-800', bg: 'bg-purple-500/10' },
    { label: 'QR / App', value: byMethod.qr, icon: Smartphone, color: 'text-orange-800', bg: 'bg-orange-500/10' },
    // Online payments only appear when there are some (most businesses don't use them)
    ...(byMethod.online > 0 ? [{ label: 'Pago online', value: byMethod.online, icon: Globe, color: 'text-primary', bg: 'bg-primary/10' }] : []),
    { label: 'Egresos', value: totalWithdrawals, icon: MinusCircle, color: 'text-red-700', bg: 'bg-red-500/10' },
    { label: 'Total Ventas', value: total, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-green-500/5 border border-green-500/20 rounded-2xl px-5 py-4">
        <div>
          <p className="text-sm font-bold text-green-800">Caja abierta</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Desde las <strong>{fmtTime(session.opened_at)}</strong> · Apertura: <strong>{formatCLP(Number(session.opening_amount))}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="min-h-11 gap-2 font-bold border-red-500/40 text-red-700 hover:bg-red-500/10"
            onClick={() => (showWithdraw ? resetWithdraw() : setShowWithdraw(true))}
            aria-expanded={showWithdraw}
          >
            <MinusCircle className="h-4 w-4" /> Sacar de Caja
          </Button>
          <Button variant="destructive" className="min-h-11 gap-2 font-bold" onClick={onStartClose}>
            <CheckCircle2 className="h-4 w-4" /> Cerrar Caja
          </Button>
        </div>
      </div>

      {showWithdraw && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-red-700">
                <MinusCircle className="h-4 w-4" /> Registrar Egreso de Caja
              </CardTitle>
              <button onClick={resetWithdraw} className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:text-foreground" aria-label="Cerrar el formulario de egreso">
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="egreso-monto" className="text-sm font-medium mb-1.5 block">Monto (CLP)</label>
                <Input id="egreso-monto" inputMode="numeric" placeholder="Ej: 15000" value={amountRaw} onChange={e => setAmountRaw(e.target.value)} autoFocus className="h-11" />
              </div>
              <div>
                <label htmlFor="egreso-motivo" className="text-sm font-medium mb-1.5 block">Motivo</label>
                <Input id="egreso-motivo" placeholder="Proveedor, cambio, gasto..." value={reason} onChange={e => setReason(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitWithdraw()} className="h-11" />
              </div>
            </div>
            {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" className="min-h-11" onClick={resetWithdraw}>Cancelar</Button>
              <Button className="min-h-11 gap-2 bg-red-700 hover:bg-red-800 text-white font-bold" onClick={submitWithdraw} disabled={withdrawing}>
                {withdrawing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirmar Egreso
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-border">
            <CardContent className="p-4">
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
              </div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-base font-bold ${color} mt-0.5`}>{formatCLP(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {withdrawals.length > 0 && (
        <Card className="border-red-500/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-red-700"><MinusCircle className="h-4 w-4" /> Egresos de caja</CardTitle>
              <span className="text-xs text-muted-foreground">{withdrawals.length} egreso{withdrawals.length !== 1 ? 's' : ''} · {formatCLP(totalWithdrawals)}</span>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="text-left text-xs text-muted-foreground font-medium px-6 py-2">Hora</th>
                    <th scope="col" className="text-left text-xs text-muted-foreground font-medium px-3 py-2">Motivo</th>
                    <th scope="col" className="text-right text-xs text-muted-foreground font-medium px-6 py-2">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawals.map(w => (
                    <tr key={w.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-2.5 text-muted-foreground text-xs">{fmtTime(w.created_at)}</td>
                      <td className="px-3 py-2.5">{w.reason}</td>
                      <td className="px-6 py-2.5 text-right font-bold text-red-700">-{formatCLP(Number(w.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><ReceiptText className="h-4 w-4 text-primary" /> Pedidos en esta sesión</CardTitle>
            <span className="text-xs text-muted-foreground">{orders.length} pedido{orders.length !== 1 ? 's' : ''}</span>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 px-6">Aún no hay pedidos pagados en esta sesión.</p>
          ) : (
            <OrdersTable orders={orders} total={total} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, History, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatCLP } from '@/lib/utils';
import { PAY_LABELS, computeArqueo, fmtDate, fmtTime, type CajaOrder, type CashSession, type Withdrawal } from '@/lib/caja';
import { fetchSessionOrders, fetchWithdrawals } from '@/lib/caja-data';
import { mensajeParaPersona } from '@/lib/errores';
import { OrdersTable } from './OrdersTable';

type Detail = { orders: CajaOrder[]; withdrawals: Withdrawal[] } | { error: string } | 'loading';

/** Past cash sessions; each one loads its orders and withdrawals when opened. */
export function CashHistory({ tenantId, history }: { tenantId: string; history: CashSession[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});

  const toggle = async (sess: CashSession) => {
    if (expanded === sess.id) return setExpanded(null);
    setExpanded(sess.id);
    const current = details[sess.id];
    if (current && current !== 'loading' && !('error' in current)) return;
    setDetails(d => ({ ...d, [sess.id]: 'loading' }));
    try {
      const [orders, withdrawals] = await Promise.all([fetchSessionOrders(tenantId, sess), fetchWithdrawals(sess.id)]);
      setDetails(d => ({ ...d, [sess.id]: { orders, withdrawals } }));
    } catch (e) {
      setDetails(d => ({ ...d, [sess.id]: { error: mensajeParaPersona(e, 'caja: historial') } }));
    }
  };

  if (history.length === 0) {
    return (
      <div className="text-center py-16">
        <History className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" aria-hidden="true" />
        <p className="text-muted-foreground">No hay cierres anteriores todavía.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {history.map(sess => {
        const detail = details[sess.id];
        const loaded = detail && detail !== 'loading' && !('error' in detail) ? detail : null;
        const { byMethod, total, totalWithdrawals, expectedCash, actualCash, diff } =
          computeArqueo(sess, loaded?.orders ?? [], loaded?.withdrawals ?? []);
        const isExpanded = expanded === sess.id;

        return (
          <Card key={sess.id} className="border-border overflow-hidden">
            <button className="w-full text-left" onClick={() => toggle(sess)} aria-expanded={isExpanded}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm">{fmtDate(sess.opened_at)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtTime(sess.opened_at)} → {sess.closed_at ? fmtTime(sess.closed_at) : '—'} · Apertura: {formatCLP(Number(sess.opening_amount))}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold">{sess.closing_amount !== null ? `Contado: ${formatCLP(Number(sess.closing_amount))}` : '—'}</p>
                      {loaded && sess.closing_amount !== null && (
                        <p className={`text-xs font-bold ${diff > 0 ? 'text-blue-800' : diff < 0 ? 'text-red-700' : 'text-green-800'}`}>
                          {diff === 0 ? '✓ Cuadrada' : diff > 0 ? `+${formatCLP(diff)}` : `-${formatCLP(Math.abs(diff))}`}
                        </p>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
              </CardHeader>
            </button>

            {isExpanded && (
              <CardContent className="pt-0 space-y-4 border-t border-border">
                {detail === 'loading' && (
                  <p className="flex items-center gap-2 pt-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando detalle…</p>
                )}
                {detail && detail !== 'loading' && 'error' in detail && (
                  <p role="alert" className="pt-4 text-sm font-semibold text-red-700">{detail.error}</p>
                )}
                {loaded && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
                      {Object.entries(byMethod).filter(([k, v]) => v > 0 || k !== 'online').map(([k, v]) => (
                        <div key={k} className="bg-muted/40 rounded-xl p-3">
                          <p className="text-xs text-muted-foreground">{PAY_LABELS[k] ?? k}</p>
                          <p className="font-bold text-sm mt-0.5">{formatCLP(v)}</p>
                        </div>
                      ))}
                      <div className="bg-primary/10 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground">Total ventas</p>
                        <p className="font-bold text-sm mt-0.5 text-primary">{formatCLP(total)}</p>
                      </div>
                    </div>

                    {loaded.withdrawals.length > 0 && (
                      <div className="rounded-xl border border-red-500/20 overflow-hidden">
                        <div className="px-4 py-2 bg-red-500/5 border-b border-red-500/10">
                          <p className="text-xs font-bold text-red-700 uppercase tracking-widest">Egresos — {formatCLP(totalWithdrawals)}</p>
                        </div>
                        {loaded.withdrawals.map(w => (
                          <div key={w.id} className="flex justify-between items-center px-4 py-2 border-b border-border/40 last:border-0 text-sm">
                            <div>
                              <span className="font-medium">{w.reason}</span>
                              <span className="text-muted-foreground text-xs ml-2">{fmtTime(w.created_at)}</span>
                            </div>
                            <span className="font-bold text-red-700">-{formatCLP(Number(w.amount))}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {sess.closing_amount !== null && (
                      <div className={`rounded-xl px-4 py-3 text-sm border ${diff === 0 ? 'bg-green-500/10 border-green-500/20' : diff > 0 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                        <div className="flex justify-between"><span className="text-muted-foreground">Efectivo esperado</span><span className="font-medium">{formatCLP(expectedCash)}</span></div>
                        <div className="flex justify-between mt-1"><span className="text-muted-foreground">Efectivo contado</span><span className="font-medium">{formatCLP(actualCash)}</span></div>
                        <div className={`flex justify-between mt-2 pt-2 border-t border-current/20 font-bold ${diff === 0 ? 'text-green-800' : diff > 0 ? 'text-blue-800' : 'text-red-700'}`}>
                          <span>{diff === 0 ? 'Caja cuadrada' : diff > 0 ? 'Sobrante' : 'Faltante'}</span>
                          <span>{diff === 0 ? '✓' : formatCLP(Math.abs(diff))}</span>
                        </div>
                      </div>
                    )}

                    {sess.notes && <p className="text-xs text-muted-foreground italic">Nota: {sess.notes}</p>}

                    {loaded.orders.length > 0 && (
                      <div className="rounded-xl border border-border overflow-hidden"><OrdersTable orders={loaded.orders} dense /></div>
                    )}
                  </>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

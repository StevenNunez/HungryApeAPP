import { formatCLP } from '@/lib/utils';
import { PAY_COLORS, PAY_LABELS, fmtTime, type CajaOrder } from '@/lib/caja';

export function PaymentBadge({ method }: { method: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${PAY_COLORS[method] || 'bg-muted text-muted-foreground border-border'}`}>
      {PAY_LABELS[method] || method}
    </span>
  );
}

/** Orders of a cash session: number, customer, time, payment method, total. */
export function OrdersTable({ orders, total, dense = false }: { orders: CajaOrder[]; total?: number; dense?: boolean }) {
  const px = dense ? 'px-4' : 'px-6';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={`border-b border-border ${dense ? 'bg-muted/40' : ''}`}>
            <th scope="col" className={`text-left text-xs text-muted-foreground font-medium ${px} py-2`}>#</th>
            <th scope="col" className="text-left text-xs text-muted-foreground font-medium px-3 py-2">Cliente</th>
            <th scope="col" className="text-left text-xs text-muted-foreground font-medium px-3 py-2">Hora</th>
            <th scope="col" className="text-left text-xs text-muted-foreground font-medium px-3 py-2">Método</th>
            <th scope="col" className={`text-right text-xs text-muted-foreground font-medium ${px} py-2`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
              <td className={`${px} py-2.5 text-muted-foreground font-mono text-xs`}>{o.short_id ? `#${o.short_id}` : '—'}</td>
              <td className="px-3 py-2.5 font-medium">{o.nickname}</td>
              <td className="px-3 py-2.5 text-muted-foreground text-xs">{fmtTime(o.created_at)}</td>
              <td className="px-3 py-2.5"><PaymentBadge method={o.payment_method} /></td>
              <td className={`${px} py-2.5 text-right font-bold`}>{formatCLP(Number(o.total))}</td>
            </tr>
          ))}
        </tbody>
        {total !== undefined && (
          <tfoot>
            <tr className="bg-muted/40">
              <td colSpan={4} className={`${px} py-3 text-sm font-bold`}>Total ventas</td>
              <td className={`${px} py-3 text-right font-bold text-primary`}>{formatCLP(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Shows surplus / shortage of a cash count with the right color and wording. */
export function DiffNote({ diff }: { diff: number }) {
  const tone = diff === 0 ? 'text-green-800' : diff > 0 ? 'text-blue-800' : 'text-red-700';
  return (
    <span className={`font-bold ${tone}`}>
      {diff === 0 ? 'Caja cuadrada ✓' : diff > 0 ? `Sobrante: ${formatCLP(diff)}` : `Faltante: ${formatCLP(Math.abs(diff))}`}
    </span>
  );
}

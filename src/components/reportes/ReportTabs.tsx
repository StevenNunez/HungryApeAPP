'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Award, CreditCard, Percent, ShoppingBag, Timer, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCLP } from '@/lib/utils';
import { formatMinutes, type computePrepTimes, type computeProfitability } from '@/lib/analytics';
import { CHART_COLORS } from './parts';

// recharts (~100 kB) only loads when a chart is on screen
const chartLoading = () => <div className="h-full w-full animate-pulse rounded-2xl bg-muted" aria-hidden="true" />;
const SalesByDayChart = dynamic(() => import('./Charts').then(m => m.SalesByDayChart), { ssr: false, loading: chartLoading });
const PayMethodsChart = dynamic(() => import('./Charts').then(m => m.PayMethodsChart), { ssr: false, loading: chartLoading });

function Kpi({ label, value, note, icon, className = '' }: { label: string; value: React.ReactNode; note?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <Card className={`border-border shadow-md ${className}`}>
      <CardContent className="pt-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
          <h3 className="text-3xl font-brand tracking-tighter truncate">{value}</h3>
          {note && <p className="text-xs text-muted-foreground mt-1">{note}</p>}
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}

/** "Reportes": sales, orders, star product, sales per day and payment methods. */
export function SalesTab({
  totalSales, totalOrders, topProduct, salesByDay, payMethods, rangeLabel,
}: {
  totalSales: number;
  totalOrders: number;
  topProduct: { name: string; qty: number };
  salesByDay: { name: string; total: number }[];
  payMethods: { name: string; value: number }[];
  rangeLabel: string;
}) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Kpi label="Ventas brutas" value={formatCLP(totalSales)}
          icon={<div className="h-12 w-12 shrink-0 bg-green-500/10 text-green-800 rounded-2xl grid place-items-center"><TrendingUp className="h-6 w-6" /></div>} />
        <Kpi label="Pedidos" value={<>{totalOrders} <span className="text-sm font-normal text-muted-foreground lowercase">pagados</span></>}
          icon={<div className="h-12 w-12 shrink-0 bg-blue-500/10 text-blue-800 rounded-2xl grid place-items-center"><ShoppingBag className="h-6 w-6" /></div>} />
        <Kpi label="Producto estrella 🏆" value={<span className="text-xl font-body font-bold">{topProduct.name}</span>} note={`${topProduct.qty} unidades vendidas`}
          icon={<div className="h-12 w-12 shrink-0 bg-accent/30 rounded-2xl grid place-items-center rotate-12"><Award className="h-6 w-6" /></div>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-border shadow-md">
          <CardHeader>
            <CardTitle className="font-brand uppercase tracking-wider">Ventas por día</CardTitle>
            <CardDescription>{rangeLabel}.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {salesByDay.length > 0
                ? <SalesByDayChart data={salesByDay} />
                : <div className="h-full grid place-items-center text-muted-foreground text-sm">No hay datos suficientes para graficar.</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-md">
          <CardHeader>
            <CardTitle className="font-brand uppercase tracking-wider flex items-center gap-2"><CreditCard className="h-5 w-5 text-muted-foreground" /> Métodos de pago</CardTitle>
            <CardDescription>Cómo prefieren pagar tus clientes.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {payMethods.length > 0
                ? <PayMethodsChart data={payMethods} />
                : <div className="h-full grid place-items-center text-muted-foreground text-sm">No hay suficientes cobros procesados.</div>}
            </div>
            {payMethods.length > 0 && (
              <ul className="flex flex-wrap justify-center gap-4 mt-2">
                {payMethods.map((pm, i) => (
                  <li key={pm.name} className="flex items-center gap-2 text-sm font-medium">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} aria-hidden="true" />
                    {pm.name} ({pm.value})
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** "Rentabilidad" (Pro): margin overall and per product. */
export function ProfitTab({ profit }: { profit: ReturnType<typeof computeProfitability> }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Kpi label="Margen" value={formatCLP(profit.margin)}
          note={profit.marginPct === null ? 'Carga costos para calcularlo' : `${profit.marginPct.toFixed(1)}% sobre lo vendido con costo`} />
        <Kpi label="Costo de lo vendido" value={formatCLP(profit.cost)} note={`Ventas totales: ${formatCLP(profit.revenue)}`} />
        <Kpi
          label="Ventas con costo"
          value={`${profit.coveragePct.toFixed(0)}%`}
          className={profit.coveragePct < 80 ? 'border-amber-500/40' : ''}
          note={profit.coveragePct < 100 ? (
            <span className="text-amber-900">
              Arma la receta en <Link href="/dashboard/insumos" className="underline">Insumos</Link> o carga el costo en <Link href="/dashboard/menu" className="underline">Mi Menú</Link>.
            </span>
          ) : undefined}
          icon={<Percent className="h-8 w-8 shrink-0 text-muted-foreground opacity-60" />}
        />
      </div>

      <Card className="border-border overflow-hidden">
        <CardHeader className="border-b border-border">
          <CardTitle className="font-brand uppercase tracking-wider text-xl">Margen por producto</CardTitle>
          <CardDescription>Usa el costo vigente cuando se vendió (el de su receta, si tiene). Los extras pagados suman a la venta.</CardDescription>
        </CardHeader>
        {profit.rows.length === 0 ? (
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No hay ventas en este período.</CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="text-left px-5 py-3">Producto</th>
                  <th scope="col" className="text-right px-3 py-3">Uds.</th>
                  <th scope="col" className="text-right px-3 py-3">Ventas</th>
                  <th scope="col" className="text-right px-3 py-3">Costo</th>
                  <th scope="col" className="text-right px-3 py-3">Margen</th>
                  <th scope="col" className="text-right px-5 py-3">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {profit.rows.map(r => (
                  <tr key={r.key} className="hover:bg-muted/30">
                    <td className="px-5 py-3 font-medium">{r.name}{!r.complete && <span className="ml-2 text-xs text-amber-800 font-bold">SIN COSTO</span>}</td>
                    <td className="text-right px-3 py-3">{r.units}</td>
                    <td className="text-right px-3 py-3">{formatCLP(r.revenue)}</td>
                    <td className="text-right px-3 py-3">{formatCLP(r.cost)}</td>
                    <td className="text-right px-3 py-3 font-bold">{formatCLP(r.margin)}</td>
                    <td className={`text-right px-5 py-3 font-bold ${r.marginPct !== null && r.marginPct < 30 ? 'text-red-700' : 'text-green-800'}`}>
                      {r.marginPct === null ? '—' : `${r.marginPct.toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/** "Tiempos" (Pro): preparation and waiting times. */
export function PrepTab({ prep }: { prep: ReturnType<typeof computePrepTimes> }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Kpi label="Preparación promedio" value={formatMinutes(prep.avgPrepMin)} note='De "En preparación" a "Listo"'
          icon={<Timer className="h-8 w-8 shrink-0 text-muted-foreground opacity-60" />} />
        <Kpi label="Espera del cliente" value={formatMinutes(prep.avgWaitMin)} note='Del pago confirmado a "Listo"' />
        <Kpi label="Pedidos medidos" value={prep.measuredOrders} note="Solo cuentan los pedidos desde que se activó esta función." />
      </div>

      <Card className="border-border overflow-hidden">
        <CardHeader className="border-b border-border">
          <CardTitle className="font-brand uppercase tracking-wider text-xl">Por producto</CardTitle>
          <CardDescription>Promedio de los pedidos que incluyen el producto (en pedidos mixtos es una aproximación).</CardDescription>
        </CardHeader>
        {prep.perProduct.length === 0 ? (
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Aún no hay pedidos con tiempos medidos. Se registran al pasar los pedidos por &quot;En preparación&quot; y &quot;Listo&quot; en la cocina.
          </CardContent>
        ) : (
          <ul className="divide-y divide-border">
            {prep.perProduct.map(p => (
              <li key={p.name} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-medium truncate pr-3">{p.name}</span>
                <span className="text-muted-foreground shrink-0 mr-6">{p.orders} pedido{p.orders !== 1 ? 's' : ''}</span>
                <span className="font-bold shrink-0 w-20 text-right">{formatMinutes(p.avgPrepMin)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

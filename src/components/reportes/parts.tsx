import Link from 'next/link';
import { FileSpreadsheet, FileText, Loader2, LockKeyhole } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RANGE_LABELS, type ReportRange } from '@/lib/analytics';

export const LOW_STOCK_THRESHOLD = 5;

export function StockBadge({ stock }: { stock: number | null }) {
  if (stock === null || stock === undefined) return <Badge variant="outline" className="text-xs">Sin control</Badge>;
  if (stock === 0) return <Badge className="bg-red-500/10 text-red-700 border-red-500/20 text-xs">Sin stock</Badge>;
  if (stock <= LOW_STOCK_THRESHOLD) return <Badge className="bg-amber-500/10 text-amber-800 border-amber-500/20 text-xs">Stock bajo ({stock})</Badge>;
  return <Badge className="bg-green-500/10 text-green-800 border-green-500/20 text-xs">{stock} uds.</Badge>;
}

export function ProLock({ feature }: { feature: string }) {
  return (
    <Card className="border-primary/40 shadow-xl">
      <CardContent className="py-16 flex flex-col items-center text-center gap-3">
        <LockKeyhole className="h-12 w-12 text-primary" aria-hidden="true" />
        <h3 className="font-brand text-2xl uppercase tracking-wider">Disponible en el Plan Pro</h3>
        <p className="text-muted-foreground max-w-md text-sm">{feature}</p>
        <Link href="/#pricing"><Button className="mt-2 rounded-xl font-bold min-h-11">Ver Planes</Button></Link>
      </CardContent>
    </Card>
  );
}

export function RangePicker({ range, onChange, loading }: { range: ReportRange; onChange: (r: ReportRange) => void; loading: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Período del reporte">
      {(Object.keys(RANGE_LABELS) as ReportRange[]).map(r => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={range === r}
          onClick={() => onChange(r)}
          className={`min-h-11 text-xs font-semibold px-3.5 rounded-xl border transition-all ${
            range === r ? 'bg-primary text-primary-foreground border-primary shadow-md' : 'border-border text-muted-foreground hover:border-primary/50'
          }`}
        >
          {RANGE_LABELS[r]}
        </button>
      ))}
      {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Cargando" />}
    </div>
  );
}

export function ExportButtons({ isPro, exporting, onExport }: { isPro: boolean; exporting: null | 'xlsx' | 'pdf'; onExport: (k: 'xlsx' | 'pdf') => void }) {
  if (!isPro) {
    return <Link href="/#pricing" className="text-xs font-semibold text-primary underline">Descargar Excel / PDF: disponible en Pro</Link>;
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="rounded-xl min-h-11" disabled={exporting !== null} onClick={() => onExport('xlsx')}>
        {exporting === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
        Excel
      </Button>
      <Button variant="outline" size="sm" className="rounded-xl min-h-11" disabled={exporting !== null} onClick={() => onExport('pdf')}>
        {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
        PDF
      </Button>
    </div>
  );
}

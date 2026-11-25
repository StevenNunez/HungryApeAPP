import { Skeleton } from '@/components/ui/skeleton';

/**
 * Placeholder with the shape of a panel screen (header, a row of figures and a
 * grid of cards) while its data arrives — instead of a full-screen spinner.
 */
export function PanelSkeleton({ cards = 6, label = 'Cargando…' }: { cards?: number; label?: string }) {
  return (
    <div className="min-h-screen bg-background" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="border-b border-border bg-background/90 px-4 sm:px-6 h-16 flex items-center justify-between">
        <Skeleton className="h-6 w-36 rounded-lg bg-foreground/10" />
        <Skeleton className="h-8 w-20 rounded-xl bg-foreground/10" />
      </div>
      <div className="container mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Skeleton className="h-9 w-64 max-w-full rounded-xl bg-foreground/10" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl bg-foreground/10" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: cards }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-3xl bg-foreground/10" />
          ))}
        </div>
      </div>
    </div>
  );
}

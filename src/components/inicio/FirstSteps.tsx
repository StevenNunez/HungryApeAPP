'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, X, UtensilsCrossed, QrCode, ShoppingBag } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const QR_SEEN_KEY = (tenantId: string) => `hungryape:qr-visto:${tenantId}`;
const DISMISSED_KEY = (tenantId: string) => `hungryape:primeros-pasos-cerrado:${tenantId}`;

/** Called by the QR page: printing the QR is the step that puts the menu in customers' hands. */
export function markQrSeen(tenantId: string) {
  try { localStorage.setItem(QR_SEEN_KEY(tenantId), '1'); } catch { /* private mode */ }
}

/**
 * First steps after signing up: the three things that make the app useful —
 * a menu, the QR on the truck, and a test order seen in the kitchen. Disappears
 * when all are done (or when the owner closes it).
 */
export function FirstSteps({ tenantId, slug }: { tenantId: string; slug: string }) {
  const [state, setState] = useState<{ products: number; orders: number; qr: boolean } | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISSED_KEY(tenantId)) === '1'); } catch { setDismissed(false); }
    const supabase = createClient();
    (async () => {
      const [p, o] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_archived', false),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      ]);
      let qr = false;
      try { qr = localStorage.getItem(QR_SEEN_KEY(tenantId)) === '1'; } catch { /* ignore */ }
      if (!p.error && !o.error) setState({ products: p.count ?? 0, orders: o.count ?? 0, qr });
    })();
  }, [tenantId]);

  if (dismissed || !state) return null;

  const steps = [
    {
      done: state.products >= 3,
      icon: UtensilsCrossed,
      title: 'Arma tu menú',
      text: state.products === 0 ? 'Agrega tus productos con foto, precio y stock.' : `Llevas ${state.products}. Con 3 o más tu menú ya se ve completo.`,
      href: '/dashboard/menu',
      cta: 'Ir al menú',
    },
    {
      done: state.qr,
      icon: QrCode,
      title: 'Imprime tu QR',
      text: 'Pégalo en el mostrador o en las mesas: así te piden desde el celular.',
      href: '/dashboard/qr',
      cta: 'Ver mi QR',
    },
    {
      done: state.orders > 0,
      icon: ShoppingBag,
      title: 'Haz un pedido de prueba',
      text: 'Pide desde tu celular y míralo llegar a la cocina. Después lo anulas.',
      href: `/m/${slug}`,
      cta: 'Abrir mi menú',
    },
  ];
  const doneCount = steps.filter(s => s.done).length;
  if (doneCount === steps.length) return null;

  const close = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY(tenantId), '1'); } catch { /* ignore */ }
  };

  return (
    <section aria-labelledby="first-steps-title" className="rounded-panel border-2 border-primary/30 bg-card p-5 sm:p-6 shadow-lg mb-8">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 id="first-steps-title" className="font-brand text-2xl tracking-wide">Primeros pasos</h2>
          <p className="text-sm text-muted-foreground">{doneCount} de {steps.length} listos · en 10 minutos estás recibiendo pedidos.</p>
        </div>
        <button type="button" onClick={close} className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted" aria-label="Ocultar primeros pasos">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="h-2 rounded-full bg-muted mb-5 overflow-hidden" aria-hidden="true">
        <div className="h-full bg-primary transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map(({ done, icon: Icon, title, text, href, cta }, i) => (
          <li key={title} className={`rounded-2xl border p-4 ${done ? 'border-green-700/30 bg-green-50' : 'border-border bg-background'}`}>
            <div className="flex items-center gap-2 mb-1">
              {done ? <CheckCircle2 className="h-5 w-5 text-green-800" aria-hidden="true" /> : <Circle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
              <span className="font-bold">{i + 1}. {title}</span>
              <span className="sr-only">{done ? '(listo)' : '(pendiente)'}</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3 flex items-start gap-2">
              <Icon className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />{text}
            </p>
            {!done && (
              <Link
                href={href}
                target={href.startsWith('/m/') ? '_blank' : undefined}
                className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
              >
                {cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

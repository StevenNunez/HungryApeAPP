'use client';

import { useEffect } from 'react';
import { reportarError } from '@/lib/errores';

/**
 * Pantalla de error de toda la app.
 *
 * El caso más común no es un fallo del código sino un deploy nuevo: quien tenía la
 * pestaña abierta (la cocina, todo el día) sigue con archivos de la versión anterior,
 * que ya no existen, y la página no carga. Recargar lo arregla, así que en ese caso
 * se recarga sola, una única vez (si persiste, se muestra el aviso en vez de entrar
 * en un bucle). Lo demás se reporta para que Teo Labs se entere.
 */
const CLAVE = 'hungryape:recarga-por-error';

function esVersionVieja(error: unknown): boolean {
  const texto = `${(error as Error | null)?.name ?? ''} ${(error as Error | null)?.message ?? ''}`;
  return /ChunkLoadError|Loading chunk|Failed to load chunk|dynamically imported module|Importing a module script failed/i.test(texto);
}

export default function ErrorDePagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const vieja = esVersionVieja(error);

  useEffect(() => {
    console.error(error);
    if (!vieja) {
      reportarError(`pantalla rota ${window.location.pathname}`, error);
      return;
    }
    try {
      const ultima = Number(window.sessionStorage.getItem(CLAVE) ?? 0);
      if (Date.now() - ultima < 60_000) return; // Ya se intentó hace poco: no repetir.
      window.sessionStorage.setItem(CLAVE, String(Date.now()));
    } catch {
      return; // Sin almacenamiento: mejor no recargar a ciegas.
    }
    window.location.reload();
  }, [error, vieja]);

  return (
    <main className="grid min-h-[60svh] place-items-center p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-lg">
        <span className="text-5xl block mb-3" aria-hidden="true">🦍</span>
        <h1 className="font-brand text-2xl tracking-wide">
          {vieja ? 'Hay una versión nueva' : 'No pudimos cargar esta página'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {vieja
            ? 'Hungry Ape se actualizó mientras la tenías abierta. Recarga para seguir.'
            : 'Puede ser algo pasajero. Reintenta y, si sigue igual, recarga la página. Ya quedó registrado.'}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-12 rounded-2xl bg-primary px-5 font-bold text-primary-foreground hover:bg-primary/90"
          >
            Recargar
          </button>
          {!vieja && (
            <button
              type="button"
              onClick={() => reset()}
              className="h-12 rounded-2xl border-2 border-border px-5 font-semibold hover:border-primary"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

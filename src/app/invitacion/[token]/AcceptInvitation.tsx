'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export function AcceptInvitation({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/equipo/aceptar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No pudimos sumarte al equipo.');
      // Full navigation: the panel layout reads the business again on the server
      window.location.assign(json.role === 'cocina' ? '/dashboard/cocina' : '/dashboard');
    } catch (e: any) {
      setError(e?.message || 'No se pudo conectar. Revisa tu conexión.');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-primary-foreground disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Unirme al equipo
      </button>
      {error && <p role="alert" className="text-sm font-semibold text-red-800">{error}</p>}
    </div>
  );
}

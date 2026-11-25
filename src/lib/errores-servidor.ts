import { createHash } from 'node:crypto';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { escapeHtml, sendInternalEmail, smtpConfigured, teoLabsSignature } from '@/lib/email';

/**
 * Registro de errores (migración 018).
 *
 * Todo error que la app no supo resolver pasa por acá: queda en los registros de
 * Vercel (`console.error`), en la tabla `errores` agrupado por huella, y la primera
 * vez que aparece uno nuevo sale un aviso por correo a Teo Labs.
 *
 * Nunca lanza: anotar un error no puede convertirse en un segundo error.
 */

export type ErrorAnotado = {
  origen: 'navegador' | 'servidor';
  /** Dónde pasó: la ruta de la API o la pantalla, p. ej. "api/mercadopago/webhook". */
  donde: string;
  error: unknown;
  detalle?: Record<string, unknown>;
  usuarioId?: string | null;
  tenantId?: string | null;
};

const AVISO_A = () =>
  process.env.AVISO_ERRORES_A?.trim() || process.env.ADMIN_EMAIL?.trim() || 'hola@teolabs.app';

/** El texto del error, sin lo que cambia de una vez a otra. */
export function normalizarMensaje(mensaje: string) {
  return mensaje
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\b\d+([.,]\d+)*\b/g, '<n>')
    .replace(/"[^"]{0,200}"/g, '"…"')
    .trim()
    .slice(0, 500);
}

export function mensajeDe(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function huellaDe(origen: string, donde: string, mensaje: string) {
  return createHash('sha256').update(`${origen}|${donde}|${normalizarMensaje(mensaje)}`).digest('hex').slice(0, 32);
}

export async function anotarError(e: ErrorAnotado): Promise<void> {
  const mensaje = mensajeDe(e.error).slice(0, 2000);
  const pila = e.error instanceof Error ? e.error.stack?.split('\n').slice(0, 8).join('\n') : undefined;
  const entorno = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'desconocido';

  console.error(`[error ${e.origen}] ${e.donde}: ${mensaje}`, pila ?? '');

  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    const sb = createServiceSupabaseClient();

    const huella = huellaDe(e.origen, e.donde, mensaje);
    const { data: esNuevo, error } = await (sb as any).rpc('registrar_error', {
      p_huella: huella,
      p_origen: e.origen,
      p_donde: e.donde,
      p_mensaje: mensaje,
      p_detalle: { ...e.detalle, ...(pila ? { pila } : {}), entorno },
      p_usuario_id: e.usuarioId ?? null,
      p_tenant_id: e.tenantId ?? null,
    });
    // Sin la 018 aplicada, el error igual quedó en los registros de Vercel.
    if (error) {
      console.error('[error] No se pudo anotar en la tabla errores:', error.message);
      return;
    }

    // Avisa solo desde producción: probando en localhost no se llena la casilla.
    if (esNuevo === true && entorno === 'production' && smtpConfigured()) {
      await avisar(e, mensaje, huella).catch(x => console.error('[error] No se pudo avisar por correo:', mensajeDe(x)));
    }
  } catch (x) {
    console.error('[error] Falló el registro de errores:', mensajeDe(x));
  }
}

async function avisar(e: ErrorAnotado, mensaje: string, huella: string) {
  const filas: [string, string][] = [
    ['Dónde', e.donde],
    ['Origen', e.origen === 'navegador' ? 'Pantalla (navegador)' : 'Servidor'],
    ['Local', e.tenantId ?? '—'],
    ['Usuario', e.usuarioId ?? '—'],
    ['Huella', huella],
  ];
  const texto = [
    'Apareció un error nuevo en Hungry Ape.',
    '',
    ...filas.map(([k, v]) => `${k}: ${v}`),
    '',
    mensaje,
    '',
    'El detalle está en Supabase → tabla errores. Si se repite, no vuelve a avisar hasta marcarlo resuelto.',
    '',
    'Desarrollado por Teo Labs ® — https://www.teolabs.app',
  ].join('\n');

  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f3f5f6;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<span style="display:none;max-height:0;overflow:hidden">Error nuevo en ${escapeHtml(e.donde)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #cdd3d7">
<tr><td style="padding:20px 24px;background:#1a1a1a;border-radius:12px 12px 0 0;border-bottom:4px solid #be1e36">
<p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a8dde8">Hungry Ape · registro de errores</p>
<h1 style="margin:6px 0 0;font-size:18px;color:#ffffff">Apareció un error nuevo</h1></td></tr>
<tr><td style="padding:20px 24px">
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5">
${filas.map(([k, v]) => `<tr><td style="padding:2px 16px 2px 0;color:#5f6b7a">${escapeHtml(k)}</td><td style="padding:2px 0">${escapeHtml(v)}</td></tr>`).join('')}
</table>
<pre style="margin:16px 0 0;padding:12px;background:#f3f5f6;border-radius:8px;font-size:13px;white-space:pre-wrap;word-break:break-word">${escapeHtml(mensaje)}</pre>
<p style="margin:16px 0 0;font-size:13px;color:#5f6b7a">El detalle está en Supabase → tabla <b>errores</b>. Si se repite, no vuelve a avisar hasta marcarlo resuelto.</p>
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #e3e6e8;font-size:12px;color:#5f6b7a">${teoLabsSignature()}</td></tr>
</table></body></html>`;

  await sendInternalEmail({
    to: AVISO_A(),
    subject: `Error nuevo en Hungry Ape · ${e.donde}`.slice(0, 180),
    text: texto,
    html,
  });
}

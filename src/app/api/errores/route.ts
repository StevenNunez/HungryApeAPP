import { createClient } from '@supabase/supabase-js';
import { anotarError } from '@/lib/errores-servidor';
import { rateLimitShared, clientIp } from '@/lib/rate-limit';

/**
 * POST /api/errores — los errores que ve una persona en pantalla (src/lib/errores.ts)
 * llegan acá y pasan al registro. Es pública a propósito (un cliente sin sesión
 * mirando el menú también tiene que poder avisar), así que solo acepta texto corto
 * y un número acotado de avisos por minuto.
 *
 * Si trae el token de la sesión, se anota quién y de qué local; el token se
 * verifica con Supabase, no se le cree al navegador.
 */

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);

async function quienEs(pedido: Request) {
  const token = pedido.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return { usuarioId: null, tenantId: null };
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb.auth.getUser(token);
  if (!data.user) return { usuarioId: null, tenantId: null };
  const { data: member } = await sb.from('tenant_members').select('tenant_id').eq('user_id', data.user.id).maybeSingle();
  if (member?.tenant_id) return { usuarioId: data.user.id, tenantId: member.tenant_id as string };
  const { data: tenant } = await sb.from('tenants').select('id').eq('owner_id', data.user.id).maybeSingle();
  return { usuarioId: data.user.id, tenantId: (tenant as { id?: string } | null)?.id ?? null };
}

export async function POST(pedido: Request) {
  if (!(await rateLimitShared(`errores:${clientIp(pedido.headers)}`, 30, 60_000))) {
    return new Response(null, { status: 429 });
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await pedido.json()) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }

  const donde = texto(cuerpo.donde, 200);
  const mensaje = texto(cuerpo.mensaje, 2000);
  if (!donde || !mensaje) return new Response(null, { status: 400 });

  const { usuarioId, tenantId } = await quienEs(pedido).catch(() => ({ usuarioId: null, tenantId: null }));

  const error = new Error(mensaje);
  error.stack = texto(cuerpo.pila, 4000) ?? undefined;

  await anotarError({
    origen: 'navegador',
    donde,
    error,
    detalle: {
      pagina: texto(cuerpo.pagina, 300),
      navegador: pedido.headers.get('user-agent')?.slice(0, 300),
    },
    usuarioId,
    tenantId,
  });

  return new Response(null, { status: 204 });
}

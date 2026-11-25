-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — 018 Registro de errores
-- Run in: Supabase Dashboard > SQL Editor > New Query  (después de 017). Idempotente.
--
-- POR QUÉ. Si algo fallaba en producción (un webhook, una pantalla que no
-- cargaba) nadie se enteraba salvo que un local avisara. Ahora el servidor
-- anota cada error acá (y en los registros de Vercel) y la primera vez que
-- aparece uno nuevo se manda un aviso por correo a Teo Labs.
--
-- UNA FILA POR ERROR, NO POR VEZ. La `huella` agrupa el mismo error (mismo
-- lugar y mismo mensaje, sin números ni identificadores): si una pantalla
-- falla cien veces se ve una fila con `veces = 100` y el aviso sale una vez.
-- Si un error marcado como resuelto vuelve a aparecer, se reabre y avisa.
--
-- QUIÉN LA VE. Nadie desde la API: RLS sin políticas. Solo la escribe el
-- servidor (service role) y se revisa en el panel de Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.errores (
  huella       TEXT PRIMARY KEY,
  origen       TEXT NOT NULL CHECK (origen IN ('navegador', 'servidor')),
  donde        TEXT NOT NULL,
  mensaje      TEXT NOT NULL,
  detalle      JSONB NOT NULL DEFAULT '{}'::jsonb,
  usuario_id   UUID,
  tenant_id    UUID,
  veces        INTEGER NOT NULL DEFAULT 1,
  primera_vez  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_vez   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelto     BOOLEAN NOT NULL DEFAULT false
);

COMMENT ON TABLE public.errores IS
  'Errores de la app, agrupados por huella (lugar + mensaje normalizado). Los escribe el servidor con la clave de servicio. Marcar resuelto = true al arreglar: si vuelve a pasar, se reabre y avisa.';

CREATE INDEX IF NOT EXISTS errores_recientes ON public.errores (resuelto, ultima_vez DESC);

ALTER TABLE public.errores ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito.

-- Anota un error y dice si es nuevo (o si volvió después de resuelto), para que
-- el servidor avise solo esa vez. Una sola sentencia: dos fallos simultáneos no duplican.
CREATE OR REPLACE FUNCTION public.registrar_error(
  p_huella     TEXT,
  p_origen     TEXT,
  p_donde      TEXT,
  p_mensaje    TEXT,
  p_detalle    JSONB,
  p_usuario_id UUID,
  p_tenant_id  UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previo BOOLEAN;
BEGIN
  SELECT resuelto INTO previo FROM public.errores WHERE huella = p_huella;

  INSERT INTO public.errores (huella, origen, donde, mensaje, detalle, usuario_id, tenant_id)
  VALUES (p_huella, p_origen, left(p_donde, 300), left(p_mensaje, 2000),
          coalesce(p_detalle, '{}'::jsonb), p_usuario_id, p_tenant_id)
  ON CONFLICT (huella) DO UPDATE
    SET veces      = public.errores.veces + 1,
        ultima_vez = now(),
        detalle    = excluded.detalle,
        usuario_id = coalesce(excluded.usuario_id, public.errores.usuario_id),
        tenant_id  = coalesce(excluded.tenant_id, public.errores.tenant_id),
        resuelto   = false;

  -- Nuevo si no existía, o si estaba resuelto y volvió.
  RETURN previo IS NULL OR previo;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_error(TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_error(TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

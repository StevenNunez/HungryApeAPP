-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — 022 Límite de intentos compartido
-- Run in: Supabase Dashboard > SQL Editor > New Query  (después de 021). Idempotente.
--
-- Los frenos contra abuso (sugerir apodo con IA, reportar errores, invitar al
-- equipo, iniciar pagos…) vivían en la memoria de cada servidor: con varias
-- instancias en Vercel, cada una contaba por su lado. Ahora cuentan en la base,
-- una ventana fija por clave. Si la base no responde, el código vuelve al conteo
-- en memoria (nunca deja de atender por esto).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  key          TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits         INTEGER     NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo el servidor (service role) la usa.

-- Cuenta un intento y dice si está permitido (true) o se pasó del límite (false).
CREATE OR REPLACE FUNCTION public.hit_rate_limit(p_key TEXT, p_limit INTEGER, p_window_seconds INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window TIMESTAMPTZ := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_hits   INTEGER;
BEGIN
  INSERT INTO public.rate_limit_hits (key, window_start, hits)
  VALUES (left(p_key, 200), v_window, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET hits = rate_limit_hits.hits + 1
  RETURNING hits INTO v_hits;

  -- Limpieza ocasional de ventanas viejas (1 de cada 100 llamadas)
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_hits WHERE window_start < now() - INTERVAL '1 day';
  END IF;

  RETURN v_hits <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.hit_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';

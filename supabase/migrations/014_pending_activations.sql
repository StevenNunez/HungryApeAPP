-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — 014 Pending activations (pay-before-signup)
-- Run in: Supabase Dashboard > SQL Editor > New Query
--
-- Un cliente puede pagar en la landing ANTES de crear su cuenta. El webhook de
-- Mercado Pago no encuentra negocio que activar, así que el pago confirmado se
-- guarda aquí (por el correo usado en el checkout) y se reclama cuando el dueño
-- de ese correo inicia sesión (POST /api/billing/claim).
--
-- Solo el service role accede: RLS activado y SIN policies.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pending_activations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL,
  plan_id     TEXT        NOT NULL,
  payment_id  TEXT        NOT NULL UNIQUE,
  annual      BOOLEAN     NOT NULL DEFAULT false,
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at  TIMESTAMPTZ,
  claimed_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_activations_email
  ON public.pending_activations (email)
  WHERE claimed_at IS NULL;

ALTER TABLE public.pending_activations ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — Cash register sessions (Caja)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  opened_by         UUID        NOT NULL REFERENCES auth.users(id),
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  opening_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  closed_at         TIMESTAMPTZ,
  closing_amount    NUMERIC(10,2),
  notes             TEXT        NOT NULL DEFAULT '',
  status            TEXT        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','closed'))
);

-- Only one open session per tenant at a time
CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_per_tenant
  ON public.cash_sessions (tenant_id)
  WHERE status = 'open';

-- RLS
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_cash_sessions" ON public.cash_sessions
  FOR ALL
  USING (
    tenant_id IN (
      SELECT id FROM public.tenants WHERE owner_id = auth.uid()
    )
  );

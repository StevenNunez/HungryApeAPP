-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — Cash withdrawals (egresos de caja)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cash_withdrawals (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID          NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  tenant_id   UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reason      TEXT          NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_cash_withdrawals" ON public.cash_withdrawals
  FOR ALL
  USING (
    tenant_id IN (
      SELECT id FROM public.tenants WHERE owner_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — Fix demo realtime + anonymous kitchen updates
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. REPLICA IDENTITY FULL ─────────────────────────────────────────────
-- Required for Supabase Realtime to filter UPDATE events by non-primary-key
-- columns (like tenant_id). Without this, realtime subscriptions with column
-- filters silently receive no events for UPDATEs.
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- ── 2. Allow anonymous kitchen updates for the demo tenant ────────────────
-- The default UPDATE policy requires auth.uid() to match the tenant owner.
-- In the demo, the kitchen is anonymous, so updates fail silently (0 rows
-- affected, no error). This policy specifically allows anyone to update
-- orders belonging to the demo tenant.
DROP POLICY IF EXISTS "Demo kitchen can update orders" ON public.orders;

CREATE POLICY "Demo kitchen can update orders"
  ON public.orders FOR UPDATE
  USING (tenant_id = 'a0000000-0000-0000-0000-000000000001')
  WITH CHECK (true);

-- ── 3. Also ensure all tenants table reads work for anonymous users ────────
-- Needed for the nested select in getOrderById (orders joined with tenants).
-- This is a safety net in case the public read policy was accidentally removed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'tenants'
      AND policyname = 'Public can read tenants'
  ) THEN
    CREATE POLICY "Public can read tenants"
      ON public.tenants FOR SELECT USING (true);
  END IF;
END $$;

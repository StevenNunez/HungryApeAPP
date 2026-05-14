-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — Per-tenant order numbering
-- Replaces the global short_id sequence with a per-tenant counter.
-- Each tenant's orders are numbered independently starting from #1.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Counter table: one row per tenant, updated atomically
CREATE TABLE IF NOT EXISTS public.tenant_order_counters (
  tenant_id   UUID    PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.tenant_order_counters ENABLE ROW LEVEL SECURITY;

-- Only the service role (webhooks, triggers) can touch this table
CREATE POLICY "Service role only"
  ON public.tenant_order_counters
  USING (false);

-- 2. Atomic increment function — returns the next number for a given tenant
CREATE OR REPLACE FUNCTION public.next_order_number(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO public.tenant_order_counters (tenant_id, last_number)
  VALUES (p_tenant_id, 1)
  ON CONFLICT (tenant_id)
  DO UPDATE SET last_number = tenant_order_counters.last_number + 1
  RETURNING last_number INTO v_next;
  RETURN v_next;
END;
$$;

-- 3. Trigger function: auto-assign short_id before each INSERT
CREATE OR REPLACE FUNCTION public.set_order_short_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.short_id := public.next_order_number(NEW.tenant_id);
  RETURN NEW;
END;
$$;

-- 4. Remove the old global default/identity so the trigger takes over
ALTER TABLE public.orders ALTER COLUMN short_id DROP DEFAULT;
ALTER TABLE public.orders ALTER COLUMN short_id DROP IDENTITY IF EXISTS;

-- 5. Attach the trigger (replace if it already exists)
DROP TRIGGER IF EXISTS trg_set_order_short_id ON public.orders;
CREATE TRIGGER trg_set_order_short_id
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_short_id();

-- 6. Backfill existing orders: assign sequential numbers per tenant ordered by created_at
WITH ranked AS (
  SELECT
    id,
    tenant_id,
    ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at, id) AS rn
  FROM public.orders
)
UPDATE public.orders o
SET short_id = r.rn
FROM ranked r
WHERE o.id = r.id;

-- 7. Seed the counters with the current max per tenant
INSERT INTO public.tenant_order_counters (tenant_id, last_number)
SELECT tenant_id, COALESCE(MAX(short_id), 0)
FROM public.orders
GROUP BY tenant_id
ON CONFLICT (tenant_id)
DO UPDATE SET last_number = EXCLUDED.last_number;

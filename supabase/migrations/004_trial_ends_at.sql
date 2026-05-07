-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — Trial expiry date for 14-day Starter trial
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Back-fill existing trial tenants: give them 14 days from their created_at
UPDATE public.tenants
SET trial_ends_at = created_at + INTERVAL '14 days'
WHERE subscription_status = 'trial' AND trial_ends_at IS NULL;

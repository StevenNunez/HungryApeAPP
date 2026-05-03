-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — Subscription columns for Mercado Pago
-- Run this in Supabase SQL Editor AFTER the initial schema
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT,
  ADD COLUMN IF NOT EXISTS subscription_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ;

-- Update the demo tenant to be "active" by default
UPDATE public.tenants
SET subscription_status = 'active', subscription_plan = 'pro'
WHERE slug = 'hungry-ape-demo';

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ Done! Subscription tracking is ready.
-- ═══════════════════════════════════════════════════════════════════════════

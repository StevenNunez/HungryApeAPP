-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — Add order_type column to orders
-- Indicates whether the order is for eating in ('aqui') or takeaway ('llevar')
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'aqui'
  CHECK (order_type IN ('aqui', 'llevar'));

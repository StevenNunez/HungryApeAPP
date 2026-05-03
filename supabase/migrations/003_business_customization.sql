-- 🦍 HUNGRY APE — Business settings and product images
-- Run this in Supabase SQL Editor

-- 1. Add more columns to tenants table
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#dc2626'; -- Crimson default

-- 2. Add image column to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Create a storage bucket for logos and products if you haven't (do this via UI usually)
-- But we can add the policy here:
-- Note: Requires 'storage' schema to exist
-- INSERT INTO storage.buckets (id, name, public) VALUES ('assets', 'assets', true) ON CONFLICT (id) DO NOTHING;

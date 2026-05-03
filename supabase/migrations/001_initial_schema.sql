-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — Full Database Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. TENANTS (Food Trucks / Negocios) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenants (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL,           -- e.g. 'tacos-el-tio' (used in URL)
  name       TEXT NOT NULL,          owner_id   UUID NOT NULL,                  -- FK to auth.users
          -- e.g. 'Tacos el Tío'
  logo_url   TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ─── 2. PRODUCTS (Menu Items) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price        NUMERIC(10,2) NOT NULL,
  image_url    TEXT NOT NULL DEFAULT 'https://picsum.photos/600/400',
  category     TEXT NOT NULL DEFAULT 'General',
  is_available BOOLEAN NOT NULL DEFAULT true,
  stock        INTEGER NOT NULL DEFAULT 0,   -- ← Inventory count
  ai_hint      TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ─── 3. ORDERS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nickname       TEXT NOT NULL,
  pickup_code    TEXT NOT NULL,               -- e.g. 'A7K2'
  payment_method TEXT NOT NULL DEFAULT 'cash', -- cash | transfer | card | qr
  total          NUMERIC(10,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'Pendiente',
  customer_id    UUID REFERENCES auth.users(id), -- Optional: linked after optional signup
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ─── 4. ORDER ITEMS (Line items per order) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id     UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  price        NUMERIC(10,2) NOT NULL,
  quantity     INTEGER NOT NULL DEFAULT 1
);

-- ─── 5. INDEXES ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_tenant   ON public.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant     ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON public.orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_pickup     ON public.orders(pickup_code);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

-- ─── 6. ROW LEVEL SECURITY ──────────────────────────────────────────────
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Products: anyone can read (customers viewing the menu), owners can write
CREATE POLICY "Public can read products"
  ON public.products FOR SELECT USING (true);

CREATE POLICY "Owners can manage their products"
  ON public.products FOR ALL
  USING (tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid()));

-- Orders: anyone can insert (guest ordering), owners can read/update their orders
CREATE POLICY "Anyone can create orders"
  ON public.orders FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read their own order by pickup code"
  ON public.orders FOR SELECT USING (true);

CREATE POLICY "Owners can update their orders"
  ON public.orders FOR UPDATE
  USING (tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid()));

-- Order Items: tied to orders
CREATE POLICY "Anyone can insert order items"
  ON public.order_items FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read order items"
  ON public.order_items FOR SELECT USING (true);

-- Tenants: public read, owners manage own
CREATE POLICY "Public can read tenants"
  ON public.tenants FOR SELECT USING (true);

CREATE POLICY "Owners can manage their tenant"
  ON public.tenants FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ─── 7. AUTO-DECREMENT STOCK FUNCTION ────────────────────────────────────
-- When an order_item is inserted, reduce the product stock by that quantity
CREATE OR REPLACE FUNCTION public.decrement_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.products
  SET stock = GREATEST(stock - NEW.quantity, 0),
      is_available = CASE WHEN (stock - NEW.quantity) > 0 THEN true ELSE false END
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_decrement_stock
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_stock();

-- ─── 8. SEED DATA (Demo Food Truck) ─────────────────────────────────────
-- Creates a demo tenant so the app works immediately
INSERT INTO public.tenants (id, slug, name, owner_id, description)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'hungry-ape-demo',
  'Hungry Ape Demo',
  '00000000-0000-0000-0000-000000000000',
  'Food truck de demostración'
) ON CONFLICT (slug) DO NOTHING;

-- Seed demo products
INSERT INTO public.products (tenant_id, name, description, price, image_url, category, is_available, stock, ai_hint)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Hamburguesa Clásica', 'Carne de res, lechuga, tomate, queso y nuestra salsa especial.', 8.99, 'https://picsum.photos/600/400', 'Hamburguesas', true, 50, 'classic burger'),
  ('a0000000-0000-0000-0000-000000000001', 'Hamburguesa Doble', 'Doble carne, doble queso, tocino y aros de cebolla.', 12.50, 'https://picsum.photos/600/400', 'Hamburguesas', true, 30, 'double burger'),
  ('a0000000-0000-0000-0000-000000000001', 'Papas Fritas', 'Crujientes y doradas, el acompañamiento perfecto.', 3.50, 'https://picsum.photos/600/400', 'Acompañamientos', true, 100, 'french fries'),
  ('a0000000-0000-0000-0000-000000000001', 'Refresco', 'Elige tu sabor favorito.', 2.00, 'https://picsum.photos/600/400', 'Bebidas', true, 200, 'soda can'),
  ('a0000000-0000-0000-0000-000000000001', 'Hot Dog Especial', 'Salchicha premium, pan artesanal, y toppings a elegir.', 6.75, 'https://picsum.photos/600/400', 'Hot Dogs', false, 0, 'special hotdog'),
  ('a0000000-0000-0000-0000-000000000001', 'Tacos al Pastor', 'Tres tacos de carne al pastor con piña, cebolla y cilantro.', 9.99, 'https://picsum.photos/600/400', 'Tacos', true, 40, 'tacos pastor')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ Done! Your Hungry Ape database is ready.
-- ═══════════════════════════════════════════════════════════════════════════

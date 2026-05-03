-- ═══════════════════════════════════════════════════════════
-- Hungry Ape — Seed de productos demo con fotos
-- Ejecutar en: Supabase → SQL Editor
-- Tenant slug: hungry-ape-demo
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant_id UUID;
BEGIN

  -- Obtener el tenant_id del demo
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'hungry-ape-demo' LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant hungry-ape-demo no encontrado. Créalo primero desde /dashboard/setup';
  END IF;

  -- Limpiar en orden correcto respetando foreign keys:
  -- 1. order_items → 2. orders → 3. products
  DELETE FROM public.order_items
    WHERE order_id IN (SELECT id FROM public.orders WHERE tenant_id = v_tenant_id);
  DELETE FROM public.orders WHERE tenant_id = v_tenant_id;
  DELETE FROM public.products WHERE tenant_id = v_tenant_id;

  -- ─── HAMBURGUESAS ───────────────────────────────────────────

  INSERT INTO public.products (tenant_id, name, description, price, category, image_url, is_available, stock, ai_hint, is_archived) VALUES
  (v_tenant_id, 'Monkey Burger Clásica', 'Vacuno 150g, lechuga, tomate, cebolla caramelizada, salsa de la casa. Papas fritas incluidas.', 4990, 'Hamburguesas',
   'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&q=80', true, 30, 'hamburguesa clasica', false),

  (v_tenant_id, 'Gorilla Double', 'Doble vacuno 120g c/u, doble queso cheddar, bacon crocante, pepinillos y salsa especial. La más bestia.', 7490, 'Hamburguesas',
   'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=500&q=80', true, 20, 'doble hamburguesa', false),

  (v_tenant_id, 'Jungle Crispy Chicken', 'Pechuga de pollo crujiente, coleslaw casero, jalapeños y mayo de miel mostaza. Estilo southern.', 5990, 'Hamburguesas',
   'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=500&q=80', true, 25, 'hamburguesa pollo', false),

  (v_tenant_id, 'Smash Burger BBQ', 'Vacuno smash 180g, aros de cebolla, queso gouda ahumado, salsa BBQ artesanal.', 6490, 'Hamburguesas',
   'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=500&q=80', true, 15, 'smash burger bbq', false),

  -- ─── COMPLETOS ──────────────────────────────────────────────

  (v_tenant_id, 'Completo Italiano', 'Vienesa grillada, palta natural, tomate fresco y mayonesa. El clásico chileno.', 2990, 'Completos',
   'https://images.unsplash.com/photo-1619740455993-9e612b1af08a?w=500&q=80', true, 40, 'completo italiano chileno', false),

  (v_tenant_id, 'Completo Dinámico', 'Vienesa grillada, tomate, mayonesa y chucrut. Para los que saben.', 2790, 'Completos',
   'https://images.unsplash.com/photo-1612392062631-94f8e6fea6f4?w=500&q=80', true, 40, 'completo dinamico', false),

  (v_tenant_id, 'Completo Especial', 'Vienesa XXL, palta, tomate, queso derretido, chucrut y salsa especial. El más cargado.', 3990, 'Completos',
   'https://images.unsplash.com/photo-1650547977597-27d0e9437b0a?w=500&q=80', true, 30, 'completo especial cargado', false),

  -- ─── PAPAS ──────────────────────────────────────────────────

  (v_tenant_id, 'Papas Fritas Simples', 'Papas de corte clásico fritas en aceite de girasol. Sal marina. Solo papas, solo felicidad.', 1990, 'Papas & Snacks',
   'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500&q=80', true, 50, 'papas fritas', false),

  (v_tenant_id, 'Papas con Queso', 'Papas fritas con salsa de queso cheddar caliente encima. Irresistibles.', 2590, 'Papas & Snacks',
   'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=500&q=80', true, 40, 'papas con queso', false),

  (v_tenant_id, 'Aros de Cebolla', 'Aros de cebolla morada apanados. Crocantes por fuera, dulces por dentro.', 2290, 'Papas & Snacks',
   'https://images.unsplash.com/photo-1639024471283-03518883512d?w=500&q=80', true, 25, 'aros cebolla', false),

  -- ─── BEBIDAS ────────────────────────────────────────────────

  (v_tenant_id, 'Coca-Cola 350ml', 'La clásica. Bien fría, con hielo.', 1490, 'Bebidas',
   'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&q=80', true, 60, 'coca cola', false),

  (v_tenant_id, 'Agua Mineral 500ml', 'Agua con o sin gas. Siempre fría.', 990, 'Bebidas',
   'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=500&q=80', true, 60, 'agua mineral', false),

  (v_tenant_id, 'Jugo Natural del Día', 'Preguntar disponibilidad. Naranja, mango o maracuyá. Preparado al momento.', 1990, 'Bebidas',
   'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=500&q=80', true, 20, 'jugo natural', false),

  -- ─── COMBOS ─────────────────────────────────────────────────

  (v_tenant_id, 'Combo Monkey', 'Monkey Burger Clásica + Papas Fritas + Bebida a elección. El combo perfecto.', 6990, 'Combos',
   'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=500&q=80', true, 20, 'combo burger papas bebida', false),

  (v_tenant_id, 'Combo Completo', 'Completo Italiano + Papas Fritas + Bebida a elección. Clásico chileno.', 4990, 'Combos',
   'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=500&q=80', true, 20, 'combo completo chileno', false);

  RAISE NOTICE 'Demo products seeded correctly for tenant: %', v_tenant_id;

END $$;

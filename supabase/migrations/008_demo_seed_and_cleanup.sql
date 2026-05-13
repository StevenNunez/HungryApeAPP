-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — Demo: modifier groups seed + cleanup support
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Seed modifier groups for demo products ────────────────────────────────
-- Demo tenant ID is fixed: a0000000-0000-0000-0000-000000000001

DO $$
DECLARE
  v_tenant_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_product    record;
  v_group_id   UUID;
BEGIN
  FOR v_product IN
    SELECT id, name, category
    FROM public.products
    WHERE tenant_id = v_tenant_id
      AND is_archived = false
      AND id NOT IN (
        SELECT DISTINCT product_id
        FROM public.product_modifier_groups
        WHERE tenant_id = v_tenant_id
      )
  LOOP

    -- Skip drinks — no salsas for Bebidas
    IF v_product.category = 'Bebidas' THEN
      CONTINUE;
    END IF;

    -- ── Salsas (checkbox, optional) — todos los alimentos
    INSERT INTO public.product_modifier_groups (product_id, tenant_id, name, type, required, sort_order)
    VALUES (v_product.id, v_tenant_id, 'Salsas', 'checkbox', false, 1)
    RETURNING id INTO v_group_id;

    INSERT INTO public.product_modifier_options (group_id, tenant_id, name, price_delta, sort_order)
    VALUES
      (v_group_id, v_tenant_id, 'Mayonesa',       0, 1),
      (v_group_id, v_tenant_id, 'Ketchup',        0, 2),
      (v_group_id, v_tenant_id, 'Mostaza',        0, 3),
      (v_group_id, v_tenant_id, 'Salsa Tártara',  0, 4),
      (v_group_id, v_tenant_id, 'Salsa Picante',  0, 5),
      (v_group_id, v_tenant_id, 'Sin Salsa',      0, 6);

    -- ── Punto de cocción (radio, required) — solo Hamburguesas
    IF v_product.category = 'Hamburguesas' THEN
      INSERT INTO public.product_modifier_groups (product_id, tenant_id, name, type, required, sort_order)
      VALUES (v_product.id, v_tenant_id, 'Punto', 'radio', true, 2)
      RETURNING id INTO v_group_id;

      INSERT INTO public.product_modifier_options (group_id, tenant_id, name, price_delta, sort_order)
      VALUES
        (v_group_id, v_tenant_id, 'Normal',      0, 1),
        (v_group_id, v_tenant_id, 'Bien Cocido', 0, 2),
        (v_group_id, v_tenant_id, 'Jugoso',      0, 3);
    END IF;

    -- ── Extras (checkbox, optional) — Hamburguesas y Hot Dogs
    IF v_product.category IN ('Hamburguesas', 'Hot Dogs') THEN
      INSERT INTO public.product_modifier_groups (product_id, tenant_id, name, type, required, sort_order)
      VALUES (v_product.id, v_tenant_id, 'Extras', 'checkbox', false, 3)
      RETURNING id INTO v_group_id;

      INSERT INTO public.product_modifier_options (group_id, tenant_id, name, price_delta, sort_order)
      VALUES
        (v_group_id, v_tenant_id, 'Queso Extra',  500, 1),
        (v_group_id, v_tenant_id, 'Palta',        500, 2),
        (v_group_id, v_tenant_id, 'Huevo Frito',  500, 3),
        (v_group_id, v_tenant_id, 'Sin Cebolla',    0, 4),
        (v_group_id, v_tenant_id, 'Sin Tomate',     0, 5);
    END IF;

    -- ── Para mojar (checkbox, optional) — Acompañamientos (papas, etc.)
    IF v_product.category = 'Acompañamientos' THEN
      INSERT INTO public.product_modifier_groups (product_id, tenant_id, name, type, required, sort_order)
      VALUES (v_product.id, v_tenant_id, 'Para mojar', 'checkbox', false, 1)
      RETURNING id INTO v_group_id;

      INSERT INTO public.product_modifier_options (group_id, tenant_id, name, price_delta, sort_order)
      VALUES
        (v_group_id, v_tenant_id, 'Ketchup',     0, 1),
        (v_group_id, v_tenant_id, 'Mayonesa',    0, 2),
        (v_group_id, v_tenant_id, 'Salsa Ranch', 0, 3),
        (v_group_id, v_tenant_id, 'Alioli',      0, 4);
    END IF;

    -- ── Toppings (checkbox, optional) — Tacos
    IF v_product.category = 'Tacos' THEN
      INSERT INTO public.product_modifier_groups (product_id, tenant_id, name, type, required, sort_order)
      VALUES (v_product.id, v_tenant_id, 'Toppings', 'checkbox', false, 2)
      RETURNING id INTO v_group_id;

      INSERT INTO public.product_modifier_options (group_id, tenant_id, name, price_delta, sort_order)
      VALUES
        (v_group_id, v_tenant_id, 'Con Cilantro',     0, 1),
        (v_group_id, v_tenant_id, 'Sin Cebolla',      0, 2),
        (v_group_id, v_tenant_id, 'Extra Piña',       0, 3),
        (v_group_id, v_tenant_id, 'Guacamole extra', 500, 4);
    END IF;

  END LOOP;

  RAISE NOTICE '✅ Demo modifier groups seeded successfully';
END $$;

-- ── 2. Allow public read of order_item_modifiers for demo tenant ─────────────
-- The default RLS policy requires owner auth — the demo kitchen is anonymous,
-- so without this policy the kitchen can't show customizations (salsas chosen).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'order_item_modifiers'
      AND policyname = 'public_read_demo_order_modifiers'
  ) THEN
    CREATE POLICY "public_read_demo_order_modifiers"
      ON public.order_item_modifiers FOR SELECT
      USING (
        order_item_id IN (
          SELECT oi.id
          FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
          WHERE o.tenant_id = 'a0000000-0000-0000-0000-000000000001'
        )
      );
  END IF;
END $$;

-- ── 3. Bump demo product stock to prevent "Agotado" from accumulating ────────
-- Cleanup API resets stock on each run, but this ensures a clean initial state.
UPDATE public.products
SET stock = 99, is_available = true
WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
  AND is_archived = false
  AND name != 'Hot Dog Especial';

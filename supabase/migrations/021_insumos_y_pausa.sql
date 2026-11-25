-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — 021 Insumos por receta (Pro) + pedidos en pausa sin plan
-- Run in: Supabase Dashboard > SQL Editor > New Query  (después de 020). Idempotente.
--
-- 1. SIN PLAN → PEDIDOS EN PAUSA. Cuando termina la prueba de 14 días y el local
--    no activa Básico, su menú se sigue viendo pero no recibe pedidos por la app
--    (create_order responde ORDERS_PAUSED). Al pagar, vuelve todo.
--
-- 2. CONTROL DE INSUMOS POR RECETA (Plan Pro en adelante).
--    • Insumos con unidad (unidad, g, ml), stock, mínimo, objetivo y costo.
--    • Receta de cada producto: "Completo italiano = 1 pan + 1 salchicha + 60 g palta…"
--    • Las opciones también: "Extra palta" suma 40 g; "Sin tomate" resta los 40 g.
--    • Cuando el pedido se PAGA (pasa de "Por Pagar" a cocina) se descuentan los
--      insumos; si se anula, vuelven. Todo queda en supply_movements.
--    • El stock de un producto con receta se calcula solo: cuántas unidades
--      alcanzan con los insumos (descontando lo reservado en pedidos sin pagar).
--      Si se acaba el pan, los completos se agotan en el menú sin tocar nada.
--    • El costo de cada venta sale de la receta (margen real).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tablas ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  unit          TEXT NOT NULL CHECK (unit IN ('unidad', 'g', 'ml')),
  stock         NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_stock     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  target_stock  NUMERIC(12,2) CHECK (target_stock IS NULL OR target_stock >= 0),
  cost_per_unit NUMERIC(12,4) CHECK (cost_per_unit IS NULL OR cost_per_unit >= 0),
  is_archived   BOOLEAN NOT NULL DEFAULT false,
  low_alert_sent_at TIMESTAMPTZ,              -- aviso por correo de "quedan pocos" (uno por bajada)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.supplies ADD COLUMN IF NOT EXISTS low_alert_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_supplies_tenant ON public.supplies (tenant_id) WHERE NOT is_archived;

-- Al reponer por encima del mínimo, el aviso se rearma para la próxima bajada
CREATE OR REPLACE FUNCTION public.rearm_supply_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stock > NEW.min_stock AND NEW.low_alert_sent_at IS NOT NULL THEN
    NEW.low_alert_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_rearm_supply_alert ON public.supplies;
CREATE TRIGGER trg_rearm_supply_alert
  BEFORE UPDATE OF stock, min_stock ON public.supplies
  FOR EACH ROW EXECUTE FUNCTION public.rearm_supply_alert();
CREATE UNIQUE INDEX IF NOT EXISTS supplies_unique_name ON public.supplies (tenant_id, lower(name)) WHERE NOT is_archived;

CREATE TABLE IF NOT EXISTS public.product_recipes (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supply_id  UUID NOT NULL REFERENCES public.supplies(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quantity   NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (product_id, supply_id)
);
CREATE INDEX IF NOT EXISTS idx_product_recipes_supply ON public.product_recipes (supply_id);

-- Opciones: cantidad positiva suma (extra palta), negativa resta (sin tomate)
CREATE TABLE IF NOT EXISTS public.option_recipes (
  option_id UUID NOT NULL REFERENCES public.product_modifier_options(id) ON DELETE CASCADE,
  supply_id UUID NOT NULL REFERENCES public.supplies(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quantity  NUMERIC(12,2) NOT NULL CHECK (quantity <> 0),
  PRIMARY KEY (option_id, supply_id)
);
CREATE INDEX IF NOT EXISTS idx_option_recipes_supply ON public.option_recipes (supply_id);

CREATE TABLE IF NOT EXISTS public.supply_movements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supply_id  UUID NOT NULL REFERENCES public.supplies(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('venta', 'anulacion', 'compra', 'merma', 'ajuste')),
  quantity   NUMERIC(12,2) NOT NULL,             -- con signo: venta/merma negativas
  unit_cost  NUMERIC(12,4),                      -- compras: costo pagado por unidad
  order_id   UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  note       TEXT CHECK (note IS NULL OR char_length(note) <= 120),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supply_movements_tenant ON public.supply_movements (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supply_movements_supply ON public.supply_movements (supply_id, created_at DESC);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS supplies_deducted_at TIMESTAMPTZ;

-- ── 2. Seguridad: dueño y encargado de un local Pro o superior ──────────────
ALTER TABLE public.supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_movements ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.supply_tenants()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t FROM public.member_tenants(ARRAY['dueno', 'encargado']) t
   WHERE public.plan_rank(public.tenant_plan(t)) >= public.plan_rank('pro');
$$;
REVOKE ALL ON FUNCTION public.supply_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supply_tenants() TO authenticated;

DROP POLICY IF EXISTS "managers_supplies" ON public.supplies;
CREATE POLICY "managers_supplies" ON public.supplies FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.supply_tenants()))
  WITH CHECK (tenant_id IN (SELECT public.supply_tenants()));

DROP POLICY IF EXISTS "managers_product_recipes" ON public.product_recipes;
CREATE POLICY "managers_product_recipes" ON public.product_recipes FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.supply_tenants()))
  WITH CHECK (
    tenant_id IN (SELECT public.supply_tenants())
    AND product_id IN (SELECT id FROM public.products p WHERE p.tenant_id = product_recipes.tenant_id)
    AND supply_id IN (SELECT id FROM public.supplies s WHERE s.tenant_id = product_recipes.tenant_id)
  );

DROP POLICY IF EXISTS "managers_option_recipes" ON public.option_recipes;
CREATE POLICY "managers_option_recipes" ON public.option_recipes FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.supply_tenants()))
  WITH CHECK (
    tenant_id IN (SELECT public.supply_tenants())
    AND option_id IN (SELECT id FROM public.product_modifier_options o WHERE o.tenant_id = option_recipes.tenant_id)
    AND supply_id IN (SELECT id FROM public.supplies s WHERE s.tenant_id = option_recipes.tenant_id)
  );

-- Movimientos: se leen desde el panel; se escriben solo con record_supply_movement()
DROP POLICY IF EXISTS "managers_read_supply_movements" ON public.supply_movements;
CREATE POLICY "managers_read_supply_movements" ON public.supply_movements FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.supply_tenants()));

-- ── 3. Cálculos ──────────────────────────────────────────────────────────────
-- Costo de un producto según su receta (NULL si no tiene receta o falta algún costo)
CREATE OR REPLACE FUNCTION public.recipe_cost(p_product_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN count(*) = 0 OR bool_or(s.cost_per_unit IS NULL) THEN NULL
           ELSE round(sum(r.quantity * s.cost_per_unit), 2)
         END
    FROM public.product_recipes r
    JOIN public.supplies s ON s.id = r.supply_id
   WHERE r.product_id = p_product_id;
$$;
REVOKE ALL ON FUNCTION public.recipe_cost(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recipe_cost(UUID) TO authenticated;

-- Insumos que consume UN pedido: por línea, (receta + opciones) × cantidad, nunca negativo
CREATE OR REPLACE FUNCTION public.order_supply_usage(p_order_id UUID)
RETURNS TABLE (supply_id UUID, quantity NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH per_line AS (
    SELECT oi.id AS item_id, oi.quantity AS units, r.supply_id, r.quantity AS q
      FROM public.order_items oi
      JOIN public.product_recipes r ON r.product_id = oi.product_id
     WHERE oi.order_id = p_order_id
    UNION ALL
    SELECT oi.id, oi.quantity, orc.supply_id, orc.quantity
      FROM public.order_items oi
      JOIN public.order_item_modifiers m ON m.order_item_id = oi.id
      JOIN public.option_recipes orc ON orc.option_id = m.option_id
     WHERE oi.order_id = p_order_id
  ), per_item AS (
    SELECT item_id, supply_id, max(units) AS units, greatest(sum(q), 0) AS q
      FROM per_line GROUP BY item_id, supply_id
  )
  SELECT supply_id, sum(units * q) AS quantity
    FROM per_item
   GROUP BY supply_id
  HAVING sum(units * q) > 0;
$$;
REVOKE ALL ON FUNCTION public.order_supply_usage(UUID) FROM PUBLIC, anon, authenticated;

-- Stock de los productos con receta = cuántas unidades alcanzan con los insumos,
-- descontando lo que ya reservan los pedidos "Por Pagar" (que aún no descuentan insumos).
CREATE OR REPLACE FUNCTION public.refresh_recipe_stock(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL
     OR public.plan_rank(public.tenant_plan(p_tenant_id)) < public.plan_rank('pro') THEN
    RETURN;
  END IF;

  WITH reserved AS (
    SELECT u.supply_id, sum(u.quantity) AS qty
      FROM public.orders o
      CROSS JOIN LATERAL public.order_supply_usage(o.id) u
     WHERE o.tenant_id = p_tenant_id AND o.status = 'Por Pagar' AND o.supplies_deducted_at IS NULL
     GROUP BY u.supply_id
  ), capacity AS (
    SELECT r.product_id,
           min(floor(greatest(s.stock - coalesce(rv.qty, 0), 0) / r.quantity))::int AS units
      FROM public.product_recipes r
      JOIN public.supplies s ON s.id = r.supply_id
      LEFT JOIN reserved rv ON rv.supply_id = r.supply_id
     WHERE r.tenant_id = p_tenant_id
     GROUP BY r.product_id
  )
  UPDATE public.products p
     SET stock = c.units,
         -- Se agota solo al quedar en 0 y vuelve solo al reponer (si el dueño lo
         -- había apagado a mano con stock disponible, se respeta)
         is_available = CASE WHEN c.units = 0 THEN false
                             WHEN p.stock = 0 THEN true
                             ELSE p.is_available END
    FROM capacity c
   WHERE p.id = c.product_id AND p.stock IS DISTINCT FROM c.units;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_recipe_stock(UUID) FROM PUBLIC, anon, authenticated;

-- ── 4. Descuento al pagar, devolución al anular ──────────────────────────────
CREATE OR REPLACE FUNCTION public.deduct_order_supplies(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.orders
   WHERE id = p_order_id AND supplies_deducted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR public.plan_rank(public.tenant_plan(v_tenant)) < public.plan_rank('pro') THEN
    RETURN;
  END IF;

  INSERT INTO public.supply_movements (tenant_id, supply_id, kind, quantity, order_id)
  SELECT v_tenant, u.supply_id, 'venta', -u.quantity, p_order_id
    FROM public.order_supply_usage(p_order_id) u;

  -- El stock puede quedar negativo: refleja que se vendió más de lo registrado (hay que contar)
  UPDATE public.supplies s
     SET stock = s.stock - u.quantity, updated_at = now()
    FROM public.order_supply_usage(p_order_id) u
   WHERE s.id = u.supply_id;

  UPDATE public.orders SET supplies_deducted_at = now() WHERE id = p_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.deduct_order_supplies(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.return_order_supplies(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.orders
   WHERE id = p_order_id AND supplies_deducted_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Devuelve exactamente lo que se descontó en la venta
  WITH sold AS (
    SELECT supply_id, -sum(quantity) AS qty
      FROM public.supply_movements
     WHERE order_id = p_order_id AND kind = 'venta'
     GROUP BY supply_id
  ), ins AS (
    INSERT INTO public.supply_movements (tenant_id, supply_id, kind, quantity, order_id)
    SELECT v_tenant, supply_id, 'anulacion', qty, p_order_id FROM sold
    RETURNING supply_id, quantity
  )
  UPDATE public.supplies s
     SET stock = s.stock + ins.quantity, updated_at = now()
    FROM ins WHERE s.id = ins.supply_id;

  UPDATE public.orders SET supplies_deducted_at = NULL WHERE id = p_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.return_order_supplies(UUID) FROM PUBLIC, anon, authenticated;

-- Pagado = sale de "Por Pagar" (o vuelve de "Cancelado" por un pago online tardío)
CREATE OR REPLACE FUNCTION public.on_order_paid_deduct_supplies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('Por Pagar', 'Cancelado')
     AND NEW.status IN ('Pendiente', 'En preparación', 'Listo', 'Entregado')
     AND NEW.supplies_deducted_at IS NULL THEN
    PERFORM public.deduct_order_supplies(NEW.id);
    PERFORM public.refresh_recipe_stock(NEW.tenant_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_paid_deduct_supplies ON public.orders;
CREATE TRIGGER trg_order_paid_deduct_supplies
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.on_order_paid_deduct_supplies();

-- cancel_order (de la 017) + devolución de insumos
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID, p_reason TEXT DEFAULT 'manual')
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_status NOT IN ('Por Pagar', 'Pendiente') THEN
    RETURN false;
  END IF;

  UPDATE public.orders
     SET status = 'Cancelado', cancelled_at = now(), cancel_reason = left(p_reason, 40)
   WHERE id = p_order_id;

  -- Devolver stock. Si el producto había quedado en 0 (y por eso "agotado"), vuelve a estar disponible.
  UPDATE public.products p
     SET is_available = CASE WHEN p.stock = 0 THEN true ELSE p.is_available END,
         stock = p.stock + q.qty
    FROM (
      SELECT product_id, sum(quantity)::int AS qty
        FROM public.order_items
       WHERE order_id = p_order_id
       GROUP BY product_id
    ) q
   WHERE p.id = q.product_id
     AND p.is_archived = false;

  -- Insumos ya descontados (pedido pagado): vuelven al inventario
  PERFORM public.return_order_supplies(p_order_id);
  PERFORM public.refresh_recipe_stock((SELECT tenant_id FROM public.orders WHERE id = p_order_id));

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ── 5. Compras, mermas y conteos (desde el panel) ────────────────────────────
-- compra: suma y actualiza el costo por unidad · merma: resta · ajuste: fija el
-- stock contado (registra la diferencia). Recalcula el stock de los productos.
CREATE OR REPLACE FUNCTION public.record_supply_movement(
  p_supply_id UUID,
  p_kind      TEXT,
  p_quantity  NUMERIC,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_note      TEXT DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supply RECORD;
  v_delta  NUMERIC;
BEGIN
  SELECT * INTO v_supply FROM public.supplies WHERE id = p_supply_id FOR UPDATE;
  IF NOT FOUND OR v_supply.tenant_id NOT IN (SELECT public.supply_tenants()) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF p_kind NOT IN ('compra', 'merma', 'ajuste') OR p_quantity IS NULL OR p_quantity < 0
     OR (p_kind <> 'ajuste' AND p_quantity = 0) THEN
    RAISE EXCEPTION 'INVALID_MOVEMENT';
  END IF;

  v_delta := CASE p_kind
    WHEN 'compra' THEN p_quantity
    WHEN 'merma'  THEN -p_quantity
    ELSE p_quantity - v_supply.stock      -- ajuste: lo contado reemplaza al stock
  END;

  INSERT INTO public.supply_movements (tenant_id, supply_id, kind, quantity, unit_cost, note, created_by)
  VALUES (v_supply.tenant_id, p_supply_id, p_kind, v_delta,
          CASE WHEN p_kind = 'compra' THEN p_unit_cost END, left(p_note, 120), (SELECT auth.uid()));

  UPDATE public.supplies
     SET stock = stock + v_delta,
         cost_per_unit = CASE WHEN p_kind = 'compra' AND p_unit_cost IS NOT NULL AND p_unit_cost >= 0
                              THEN p_unit_cost ELSE cost_per_unit END,
         updated_at = now()
   WHERE id = p_supply_id;

  PERFORM public.refresh_recipe_stock(v_supply.tenant_id);
  RETURN v_supply.stock + v_delta;
END;
$$;
REVOKE ALL ON FUNCTION public.record_supply_movement(UUID, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_supply_movement(UUID, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- Para el panel, después de editar recetas o insumos
CREATE OR REPLACE FUNCTION public.refresh_my_recipe_stock()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t UUID;
BEGIN
  FOR t IN SELECT public.supply_tenants() LOOP
    PERFORM public.refresh_recipe_stock(t);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_my_recipe_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_my_recipe_stock() TO authenticated;

-- ── 5b. Avisos de insumo bajo ────────────────────────────────────────────────
-- El servidor la llama después de confirmar un pago: devuelve los insumos que
-- acaban de quedar en o bajo su mínimo y los marca, para avisar una sola vez.
CREATE OR REPLACE FUNCTION public.take_low_supply_alerts(p_tenant_id UUID)
RETURNS TABLE (name TEXT, unit TEXT, stock NUMERIC, min_stock NUMERIC, target_stock NUMERIC)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.supplies s
     SET low_alert_sent_at = now()
   WHERE s.tenant_id = p_tenant_id
     AND NOT s.is_archived
     AND s.min_stock > 0
     AND s.stock <= s.min_stock
     AND s.low_alert_sent_at IS NULL
  RETURNING s.name, s.unit, s.stock, s.min_stock, s.target_stock;
$$;
REVOKE ALL ON FUNCTION public.take_low_supply_alerts(UUID) FROM PUBLIC, anon, authenticated;

-- ── 6. create_order: pedidos en pausa sin plan, costo por receta, stock por receta ──
CREATE OR REPLACE FUNCTION public.create_order(
  p_tenant_slug    TEXT,
  p_nickname       TEXT,
  p_payment_method TEXT,
  p_order_type     TEXT,
  p_items          JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_demo CONSTANT UUID := 'a0000000-0000-0000-0000-000000000001';
  c_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_tenant     RECORD;
  v_plan       TEXT;
  v_today      TIMESTAMPTZ;
  v_count      INTEGER;
  v_order_id   UUID;
  v_short_id   INTEGER;
  v_code       TEXT := '';
  v_total      NUMERIC := 0;
  v_line       JSONB;
  v_prod       RECORD;
  v_cost       NUMERIC;
  v_short_name TEXT;
  v_qty        INTEGER;
  v_opt_ids    UUID[];
  v_unit       NUMERIC;
  v_item_id    UUID;
  v_found      INTEGER;
  v_group      RECORD;
  v_selected   INTEGER;
BEGIN
  p_nickname := btrim(coalesce(p_nickname, ''));
  IF char_length(p_nickname) < 1 OR char_length(p_nickname) > 30 THEN
    RAISE EXCEPTION 'INVALID_NICKNAME';
  END IF;
  IF p_payment_method NOT IN ('cash', 'transfer', 'card', 'qr', 'online') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD';
  END IF;
  IF p_order_type NOT IN ('aqui', 'llevar') THEN
    RAISE EXCEPTION 'INVALID_ORDER_TYPE';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'INVALID_ITEMS';
  END IF;

  SELECT id, plan_id, subscription_status, trial_ends_at, subscription_expires_at,
         EXISTS (SELECT 1 FROM public.tenant_payment_accounts a WHERE a.tenant_id = tenants.id) AS has_online
    INTO v_tenant
    FROM public.tenants
   WHERE slug = p_tenant_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND';
  END IF;

  -- Los "Por Pagar" abandonados devuelven su stock antes de validar este pedido
  PERFORM public.expire_unpaid_orders(v_tenant.id);

  v_plan := public.effective_plan(
    v_tenant.plan_id, v_tenant.subscription_status,
    v_tenant.trial_ends_at, v_tenant.subscription_expires_at
  );

  IF v_tenant.id <> c_demo THEN
    -- Sin plan (terminó la prueba y no activó Básico): el menú se ve, pero no recibe pedidos
    IF public.plan_rank(v_plan) < public.plan_rank('basico') THEN
      RAISE EXCEPTION 'ORDERS_PAUSED';
    END IF;
    -- Básico y Starter: efectivo y transferencia. Tarjeta/QR en caja y pago online, desde Pro
    -- (una cuenta de Mercado Pago que quedó conectada no habilita cobrar online si el plan bajó).
    IF public.plan_rank(v_plan) < public.plan_rank('pro') AND p_payment_method NOT IN ('cash', 'transfer') THEN
      RAISE EXCEPTION 'PAYMENT_METHOD_NOT_ALLOWED';
    END IF;
    IF p_payment_method = 'online' AND NOT v_tenant.has_online THEN
      RAISE EXCEPTION 'PAYMENT_METHOD_NOT_ALLOWED';
    END IF;

    -- Básico: hasta 40 pedidos por día (Starter en adelante, sin límite)
    IF public.plan_rank(v_plan) < public.plan_rank('starter') THEN
      v_today := date_trunc('day', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago';
      SELECT count(*) INTO v_count
        FROM public.orders
       WHERE tenant_id = v_tenant.id AND created_at >= v_today AND status <> 'Cancelado';
      IF v_count >= 40 THEN
        RAISE EXCEPTION 'LIMIT_REACHED: El local llegó a su límite de pedidos por hoy.';
      END IF;
    END IF;
  END IF;

  -- Antispam: máx. 60 pedidos sin pagar por local en 10 min, y 3 por apodo
  SELECT count(*) INTO v_count
    FROM public.orders
   WHERE tenant_id = v_tenant.id AND status = 'Por Pagar'
     AND created_at > now() - INTERVAL '10 minutes';
  IF v_count >= 60 THEN
    RAISE EXCEPTION 'TOO_MANY_PENDING';
  END IF;
  SELECT count(*) INTO v_count
    FROM public.orders
   WHERE tenant_id = v_tenant.id AND status = 'Por Pagar'
     AND lower(nickname) = lower(p_nickname)
     AND created_at > now() - INTERVAL '10 minutes';
  IF v_count >= 3 THEN
    RAISE EXCEPTION 'TOO_MANY_PENDING';
  END IF;

  FOR i IN 1..4 LOOP
    v_code := v_code || substr(c_alphabet, 1 + floor(random() * char_length(c_alphabet))::int, 1);
  END LOOP;

  INSERT INTO public.orders (tenant_id, nickname, pickup_code, payment_method, order_type, total, status)
  VALUES (v_tenant.id, p_nickname, v_code, p_payment_method, p_order_type, 0, 'Por Pagar')
  RETURNING id, short_id INTO v_order_id, v_short_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_line->>'quantity')::int;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 10 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;

    SELECT id, name, price, stock, is_available, is_archived
      INTO v_prod
      FROM public.products
     WHERE id = (v_line->>'product_id')::uuid AND tenant_id = v_tenant.id
       FOR UPDATE;
    IF NOT FOUND OR v_prod.is_archived THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
    END IF;
    IF NOT v_prod.is_available OR v_prod.stock < v_qty THEN
      RAISE EXCEPTION 'OUT_OF_STOCK: %', v_prod.name;
    END IF;

    -- Costo congelado en la venta: el de su receta (Pro) o, si no tiene, el cargado a mano
    v_cost := public.recipe_cost(v_prod.id);
    IF v_cost IS NULL THEN
      SELECT cost INTO v_cost FROM public.product_private WHERE product_id = v_prod.id;
    END IF;

    SELECT coalesce(array_agg(DISTINCT x::uuid), ARRAY[]::uuid[])
      INTO v_opt_ids
      FROM jsonb_array_elements_text(coalesce(v_line->'option_ids', '[]'::jsonb)) AS x;

    SELECT count(*) INTO v_found
      FROM public.product_modifier_options o
      JOIN public.product_modifier_groups g ON g.id = o.group_id
     WHERE o.id = ANY (v_opt_ids) AND g.product_id = v_prod.id;
    IF v_found <> coalesce(array_length(v_opt_ids, 1), 0) THEN
      RAISE EXCEPTION 'INVALID_OPTION';
    END IF;

    FOR v_group IN
      SELECT g.id, g.name, g.type, g.required
        FROM public.product_modifier_groups g
       WHERE g.product_id = v_prod.id
    LOOP
      SELECT count(*) INTO v_selected
        FROM public.product_modifier_options o
       WHERE o.group_id = v_group.id AND o.id = ANY (v_opt_ids);
      IF v_group.required AND v_selected = 0 THEN
        RAISE EXCEPTION 'MISSING_REQUIRED_OPTION: %', v_group.name;
      END IF;
      IF v_group.type = 'radio' AND v_selected > 1 THEN
        RAISE EXCEPTION 'TOO_MANY_OPTIONS: %', v_group.name;
      END IF;
    END LOOP;

    SELECT v_prod.price + coalesce(sum(o.price_delta), 0)
      INTO v_unit
      FROM public.product_modifier_options o
     WHERE o.id = ANY (v_opt_ids);

    INSERT INTO public.order_items (order_id, product_id, product_name, price, quantity, unit_cost)
    VALUES (v_order_id, v_prod.id, v_prod.name, v_unit, v_qty, v_cost)
    RETURNING id INTO v_item_id;

    INSERT INTO public.order_item_modifiers (order_item_id, option_id, option_name, group_name, price_delta)
    SELECT v_item_id, o.id, o.name, g.name, o.price_delta
      FROM public.product_modifier_options o
      JOIN public.product_modifier_groups g ON g.id = o.group_id
     WHERE o.id = ANY (v_opt_ids);

    v_total := v_total + v_unit * v_qty;
  END LOOP;

  UPDATE public.orders SET total = v_total WHERE id = v_order_id;

  -- Insumos para el pedido COMPLETO: un completo y una salchipapa comparten la
  -- vienesa, y revisar producto por producto podía dejar pasar uno de más.
  IF public.plan_rank(v_plan) >= public.plan_rank('pro') THEN
    SELECT s.name INTO v_short_name
      FROM public.order_supply_usage(v_order_id) u
      JOIN public.supplies s ON s.id = u.supply_id
      LEFT JOIN LATERAL (
        SELECT coalesce(sum(ou.quantity), 0) AS qty
          FROM public.orders o
          CROSS JOIN LATERAL public.order_supply_usage(o.id) ou
         WHERE o.tenant_id = v_tenant.id AND o.status = 'Por Pagar'
           AND o.supplies_deducted_at IS NULL AND o.id <> v_order_id
           AND ou.supply_id = u.supply_id
      ) other ON true
     WHERE s.stock - other.qty < u.quantity
     LIMIT 1;
    IF v_short_name IS NOT NULL THEN
      RAISE EXCEPTION 'OUT_OF_STOCK: %', v_short_name;
    END IF;
  END IF;

  -- Productos con receta: su stock se recalcula con lo que este pedido deja reservado
  PERFORM public.refresh_recipe_stock(v_tenant.id);

  RETURN jsonb_build_object('id', v_order_id, 'short_id', v_short_id, 'pickup_code', v_code);
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ Verifica:  select name, stock, unit from supplies limit 5;
-- ═══════════════════════════════════════════════════════════════════════════

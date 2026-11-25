-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — 017 Correcciones de la auditoría (Fase 1)
-- Run in: Supabase Dashboard > SQL Editor > New Query  (después de 016)
-- Aplicar JUNTO con el deploy del código nuevo: el código ya no lee
-- products.cost / products.restock_target (pasan a product_private).
--
--  1. Storage: cada cuenta solo escribe en la carpeta de SU local
--  2. Costos privados: cost y restock_target salen de products (lectura pública)
--  3. Estado "Cancelado" + devolución de stock + caducidad de "Por Pagar"
--  4. create_order: caduca lo viejo, lee el costo privado y topes realistas
--  5. Un dueño = un local (UNIQUE owner_id + FK a auth.users)
--  6. next_order_number: sin acceso público
--  7. Índices que faltaban
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Chequeo previo: dueños con más de un local ────────────────────────────
-- Si esto falla, revisa:  SELECT owner_id, array_agg(slug) FROM tenants GROUP BY 1 HAVING count(*) > 1;
-- y borra (o reasigna) los locales duplicados antes de volver a correr la migración.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants GROUP BY owner_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Hay cuentas con más de un local. Resuélvelo antes de aplicar 017 (ver comentario).';
  END IF;
END $$;

-- ── 1. Storage por carpeta de local ──────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated upload images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete images" ON storage.objects;

CREATE POLICY "Owners upload images to their tenant folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.tenants WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Owners update images in their tenant folder"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.tenants WHERE owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.tenants WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Owners delete images in their tenant folder"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.tenants WHERE owner_id = (SELECT auth.uid())
    )
  );

-- ── 2. Costos privados ───────────────────────────────────────────────────────
-- products se lee públicamente (menú) y viaja por Realtime: el costo no puede vivir ahí.
CREATE TABLE IF NOT EXISTS public.product_private (
  product_id     UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cost           NUMERIC(10,2) CHECK (cost IS NULL OR cost >= 0),
  restock_target INTEGER       CHECK (restock_target IS NULL OR restock_target >= 0),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_private_tenant ON public.product_private (tenant_id);
ALTER TABLE public.product_private ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage their product costs" ON public.product_private;
CREATE POLICY "Owners manage their product costs"
  ON public.product_private FOR ALL
  TO authenticated
  USING (tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = (SELECT auth.uid())))
  WITH CHECK (
    tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = (SELECT auth.uid()))
    AND product_id IN (SELECT id FROM public.products p WHERE p.tenant_id = product_private.tenant_id)
  );

-- Copiar lo que ya existe y sacar las columnas de products
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'cost'
  ) THEN
    INSERT INTO public.product_private (product_id, tenant_id, cost, restock_target)
    SELECT id, tenant_id, cost, restock_target
      FROM public.products
     WHERE cost IS NOT NULL OR restock_target IS NOT NULL
    ON CONFLICT (product_id) DO NOTHING;

    ALTER TABLE public.products DROP COLUMN cost;
    ALTER TABLE public.products DROP COLUMN restock_target;
  END IF;
END $$;

-- ── 3. Cancelación y caducidad ───────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Estados válidos (NOT VALID: no revisa filas viejas, sí todas las nuevas)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('Por Pagar', 'Pendiente', 'En preparación', 'Listo', 'Entregado', 'Cancelado')) NOT VALID;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cash', 'transfer', 'card', 'qr', 'online')) NOT VALID;

-- Anula UN pedido y devuelve su stock. Solo desde "Por Pagar" o "Pendiente"
-- (lo que ya se está cocinando no vuelve al inventario). Devuelve true si anuló.
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

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(UUID, TEXT) FROM PUBLIC, anon, authenticated;
-- Solo el servidor (service role) la llama: /api/orders/:id/status valida al dueño antes.

-- Anula los "Por Pagar" con más de 60 minutos. Sin tenant → todos los locales (cron).
CREATE OR REPLACE FUNCTION public.expire_unpaid_orders(p_tenant_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id    UUID;
  v_count INTEGER := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.orders
     WHERE status = 'Por Pagar'
       AND paid_online = false
       AND created_at < now() - INTERVAL '60 minutes'
       AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
     ORDER BY created_at
     LIMIT 500
  LOOP
    IF public.cancel_order(v_id, 'caducado') THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- La versión de todos los locales (sin tenant) es solo para el servidor (cron).
REVOKE ALL ON FUNCTION public.expire_unpaid_orders(UUID) FROM PUBLIC, anon, authenticated;

-- La cocina la dispara al cargar, solo para un local. Es una regla fija (más de 60 min
-- sin pagar), así que exponerla no le da a nadie poder sobre pedidos ajenos.
CREATE OR REPLACE FUNCTION public.expire_unpaid_orders_for(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN p_tenant_id IS NULL THEN 0 ELSE public.expire_unpaid_orders(p_tenant_id) END;
$$;
REVOKE ALL ON FUNCTION public.expire_unpaid_orders_for(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_orders_for(UUID) TO anon, authenticated;

-- ── 4. create_order (reemplaza la de 016) ────────────────────────────────────
-- Cambios: caduca lo viejo antes de contar, costo desde product_private,
-- máx. 20 líneas y 10 unidades por línea (antes 40 × 20).
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
    IF v_plan IN ('gratis', 'starter') AND p_payment_method NOT IN ('cash', 'transfer') THEN
      RAISE EXCEPTION 'PAYMENT_METHOD_NOT_ALLOWED';
    END IF;
    IF p_payment_method = 'online' AND NOT v_tenant.has_online THEN
      RAISE EXCEPTION 'PAYMENT_METHOD_NOT_ALLOWED';
    END IF;

    IF v_plan = 'gratis' THEN
      v_today := date_trunc('day', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago';
      SELECT count(*) INTO v_count
        FROM public.orders
       WHERE tenant_id = v_tenant.id AND created_at >= v_today AND status <> 'Cancelado';
      IF v_count >= 40 THEN
        RAISE EXCEPTION 'LIMIT_REACHED: El local ha alcanzado su límite de pedidos gratis por hoy.';
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

    SELECT cost INTO v_cost FROM public.product_private WHERE product_id = v_prod.id;

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

  RETURN jsonb_build_object('id', v_order_id, 'short_id', v_short_id, 'pickup_code', v_code);
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- ── 5. Un dueño = un local ───────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS tenants_owner_id_key ON public.tenants (owner_id);

-- FK a auth.users. NOT VALID porque la demo tiene un dueño ficticio (000…0);
-- igual se revisa en cada local nuevo o cambio de dueño.
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_owner_id_fkey;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

-- ── 6. next_order_number: solo uso interno (trigger de pedidos) ──────────────
ALTER FUNCTION public.next_order_number(UUID) SET search_path = public;
ALTER FUNCTION public.set_order_short_id() SET search_path = public;
REVOKE ALL ON FUNCTION public.next_order_number(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_order_short_id() FROM PUBLIC, anon, authenticated;

-- ── 7. Índices ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created   ON public.orders (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_unpaid           ON public.orders (created_at) WHERE status = 'Por Pagar';
CREATE INDEX IF NOT EXISTS idx_order_items_product     ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_session ON public.cash_withdrawals (session_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_tenant    ON public.cash_sessions (tenant_id, closed_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ Verifica:
--   select * from product_private limit 3;
--   select public.expire_unpaid_orders_for('<id de un local>');
-- ═══════════════════════════════════════════════════════════════════════════

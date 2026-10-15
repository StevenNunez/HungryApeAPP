-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — 013 Security hardening
-- Run in: Supabase Dashboard > SQL Editor > New Query
--
-- Qué hace:
--   1. Cierra el UPDATE abierto de orders (OR true) y el SELECT público de
--      orders / order_items / tenants.
--   2. Crea la vista pública `tenants_public` (solo datos de vitrina).
--   3. Los pedidos se crean y se consultan solo vía RPC (`create_order`,
--      `get_order_public`): el servidor calcula precios, total y límites.
--   4. Un dueño ya no puede cambiarse su propio plan / estado de suscripción.
--   5. `subscription_expires_at` para que el plan anual expire.
--
-- IMPORTANTE: desplegar el código nuevo y correr esta migración juntos.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Columnas de facturación ──────────────────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS plan_id TEXT DEFAULT 'gratis',
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- ── 1. Plan efectivo (misma regla que getEffectivePlan() en src/lib/data.ts) ─
CREATE OR REPLACE FUNCTION public.effective_plan(
  p_plan_id TEXT,
  p_status TEXT,
  p_trial_ends_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ
) RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_status = 'trial' AND p_trial_ends_at IS NOT NULL AND p_trial_ends_at > now()
      THEN 'starter'
    WHEN p_plan_id IS NOT NULL AND p_plan_id <> 'gratis' AND p_status = 'active'
         AND (p_expires_at IS NULL OR p_expires_at > now())
      THEN p_plan_id
    ELSE 'gratis'
  END
$$;

-- ── 2. Guardia de facturación en tenants ────────────────────────────────────
-- Las políticas RLS dejaban a un dueño insertar/actualizar su fila con
-- plan_id = 'pro' y subscription_status = 'active' (plan gratis a mano).
-- Solo el service role (webhook, crons) o el SQL editor pueden tocar esas columnas.
CREATE OR REPLACE FUNCTION public.protect_tenant_billing()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.plan_id := 'gratis';
      NEW.subscription_status := 'trial';
      NEW.trial_ends_at := now() + INTERVAL '14 days';
      NEW.subscription_plan := NULL;
      NEW.subscription_payment_id := NULL;
      NEW.subscription_updated_at := NULL;
      NEW.subscription_expires_at := NULL;
    ELSE
      NEW.owner_id := OLD.owner_id;
      NEW.plan_id := OLD.plan_id;
      NEW.subscription_status := OLD.subscription_status;
      NEW.subscription_plan := OLD.subscription_plan;
      NEW.subscription_payment_id := OLD.subscription_payment_id;
      NEW.subscription_updated_at := OLD.subscription_updated_at;
      NEW.trial_ends_at := OLD.trial_ends_at;
      NEW.subscription_expires_at := OLD.subscription_expires_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_tenant_billing ON public.tenants;
CREATE TRIGGER trg_protect_tenant_billing
  BEFORE INSERT OR UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_tenant_billing();

-- ── 3. TENANTS: lectura solo del dueño + vista pública ──────────────────────
DROP POLICY IF EXISTS "Public can read tenants" ON public.tenants;
-- (la policy "Owners can read their tenant" de la migración 002 sigue activa)

DROP VIEW IF EXISTS public.tenants_public;
CREATE VIEW public.tenants_public AS
  SELECT
    t.id,
    t.slug,
    t.name,
    t.logo_url,
    t.description,
    t.phone,
    t.address,
    public.effective_plan(
      t.plan_id, t.subscription_status, t.trial_ends_at, t.subscription_expires_at
    ) AS effective_plan
  FROM public.tenants t;

GRANT SELECT ON public.tenants_public TO anon, authenticated;

-- ── 4. ORDERS ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can read their own order by pickup code" ON public.orders;
DROP POLICY IF EXISTS "Owners can update their orders" ON public.orders;
DROP POLICY IF EXISTS "Demo kitchen can update orders" ON public.orders;

-- INSERT: sin policy → solo create_order() (SECURITY DEFINER) puede crear pedidos.

CREATE POLICY "Owners can read their orders"
  ON public.orders FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can update their orders"
  ON public.orders FOR UPDATE
  USING (tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid()));

-- La cocina de la demo es anónima (/demo)
CREATE POLICY "Demo kitchen can read orders"
  ON public.orders FOR SELECT
  USING (tenant_id = 'a0000000-0000-0000-0000-000000000001');

CREATE POLICY "Demo kitchen can update orders"
  ON public.orders FOR UPDATE
  USING (tenant_id = 'a0000000-0000-0000-0000-000000000001')
  WITH CHECK (tenant_id = 'a0000000-0000-0000-0000-000000000001');

-- ── 5. ORDER ITEMS / MODIFIERS ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Anyone can read order items" ON public.order_items;
DROP POLICY IF EXISTS "public_insert_order_item_modifiers" ON public.order_item_modifiers;

CREATE POLICY "Owners can read their order items"
  ON public.order_items FOR SELECT
  USING (
    order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.tenants t ON t.id = o.tenant_id
      WHERE t.owner_id = auth.uid()
    )
  );

CREATE POLICY "Demo kitchen can read order items"
  ON public.order_items FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
    )
  );
-- order_item_modifiers: SELECT de dueño (007) y de demo (008) siguen vigentes.

-- ── 6. RPC: crear pedido (precios y total los calcula el servidor) ──────────
-- p_items: [{ "product_id": "<uuid>", "quantity": 2, "option_ids": ["<uuid>", ...] }]
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
  v_qty        INTEGER;
  v_opt_ids    UUID[];
  v_unit       NUMERIC;
  v_item_id    UUID;
  v_found      INTEGER;
  v_group      RECORD;
  v_selected   INTEGER;
BEGIN
  -- Validación básica de entrada
  p_nickname := btrim(coalesce(p_nickname, ''));
  IF char_length(p_nickname) < 1 OR char_length(p_nickname) > 30 THEN
    RAISE EXCEPTION 'INVALID_NICKNAME';
  END IF;
  IF p_payment_method NOT IN ('cash', 'transfer', 'card', 'qr') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD';
  END IF;
  IF p_order_type NOT IN ('aqui', 'llevar') THEN
    RAISE EXCEPTION 'INVALID_ORDER_TYPE';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 40 THEN
    RAISE EXCEPTION 'INVALID_ITEMS';
  END IF;

  SELECT id, plan_id, subscription_status, trial_ends_at, subscription_expires_at
    INTO v_tenant
    FROM public.tenants
   WHERE slug = p_tenant_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND';
  END IF;

  v_plan := public.effective_plan(
    v_tenant.plan_id, v_tenant.subscription_status,
    v_tenant.trial_ends_at, v_tenant.subscription_expires_at
  );

  IF v_tenant.id <> c_demo THEN
    -- Tarjeta y QR solo en planes superiores (misma regla que el carrito)
    IF v_plan IN ('gratis', 'starter') AND p_payment_method NOT IN ('cash', 'transfer') THEN
      RAISE EXCEPTION 'PAYMENT_METHOD_NOT_ALLOWED';
    END IF;

    -- Límite diario del plan gratis (día calendario de Chile)
    IF v_plan = 'gratis' THEN
      v_today := date_trunc('day', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago';
      SELECT count(*) INTO v_count
        FROM public.orders
       WHERE tenant_id = v_tenant.id AND created_at >= v_today;
      IF v_count >= 40 THEN
        RAISE EXCEPTION 'LIMIT_REACHED: El local ha alcanzado su límite de pedidos gratis por hoy.';
      END IF;
    END IF;
  END IF;

  -- Código de retiro de 4 caracteres
  FOR i IN 1..4 LOOP
    v_code := v_code || substr(c_alphabet, 1 + floor(random() * char_length(c_alphabet))::int, 1);
  END LOOP;

  INSERT INTO public.orders (tenant_id, nickname, pickup_code, payment_method, order_type, total, status)
  VALUES (v_tenant.id, p_nickname, v_code, p_payment_method, p_order_type, 0, 'Por Pagar')
  RETURNING id, short_id INTO v_order_id, v_short_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_line->>'quantity')::int;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 20 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;

    -- Bloquea la fila para que el stock sea consistente entre líneas y pedidos
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

    SELECT coalesce(array_agg(DISTINCT x::uuid), ARRAY[]::uuid[])
      INTO v_opt_ids
      FROM jsonb_array_elements_text(coalesce(v_line->'option_ids', '[]'::jsonb)) AS x;

    -- Todas las opciones deben pertenecer a grupos de ESTE producto
    SELECT count(*) INTO v_found
      FROM public.product_modifier_options o
      JOIN public.product_modifier_groups g ON g.id = o.group_id
     WHERE o.id = ANY (v_opt_ids) AND g.product_id = v_prod.id;
    IF v_found <> coalesce(array_length(v_opt_ids, 1), 0) THEN
      RAISE EXCEPTION 'INVALID_OPTION';
    END IF;

    -- Reglas de grupo: obligatorio (>=1) y radio (<=1)
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

    INSERT INTO public.order_items (order_id, product_id, product_name, price, quantity)
    VALUES (v_order_id, v_prod.id, v_prod.name, v_unit, v_qty)
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

-- ── 7. RPC: seguimiento público de UN pedido (por su UUID) ──────────────────
CREATE OR REPLACE FUNCTION public.get_order_public(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order    RECORD;
  v_tenant   RECORD;
  v_items    JSONB;
  v_transfer JSONB := NULL;
BEGIN
  SELECT id, tenant_id, nickname, pickup_code, short_id, status,
         payment_method, order_type, total, created_at
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', oi.id,
           'product_id', oi.product_id,
           'product_name', oi.product_name,
           'price', oi.price,
           'quantity', oi.quantity,
           'modifiers', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'option_id', m.option_id,
                      'option_name', m.option_name,
                      'group_name', m.group_name,
                      'price_delta', m.price_delta))
               FROM public.order_item_modifiers m
              WHERE m.order_item_id = oi.id
           ), '[]'::jsonb)
         )), '[]'::jsonb)
    INTO v_items
    FROM public.order_items oi
   WHERE oi.order_id = v_order.id;

  -- Datos bancarios: solo si el cliente eligió transferencia en ESTE pedido
  IF v_order.payment_method = 'transfer' THEN
    SELECT transfer_bank, transfer_account_type, transfer_account_number,
           transfer_rut, transfer_email
      INTO v_tenant
      FROM public.tenants
     WHERE id = v_order.tenant_id;
    v_transfer := jsonb_build_object(
      'bank', v_tenant.transfer_bank,
      'account_type', v_tenant.transfer_account_type,
      'account_number', v_tenant.transfer_account_number,
      'rut', v_tenant.transfer_rut,
      'email', v_tenant.transfer_email
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_order.id,
    'tenant_id', v_order.tenant_id,
    'nickname', v_order.nickname,
    'pickup_code', v_order.pickup_code,
    'short_id', v_order.short_id,
    'status', v_order.status,
    'payment_method', v_order.payment_method,
    'order_type', v_order.order_type,
    'total', v_order.total,
    'created_at', v_order.created_at,
    'items', v_items,
    'transfer', v_transfer
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_public(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_public(UUID) TO anon, authenticated;

-- ── 8. Índices ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created
  ON public.orders (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modifier_groups_product
  ON public.product_modifier_groups (product_id);
CREATE INDEX IF NOT EXISTS idx_modifier_options_group
  ON public.product_modifier_options (group_id);
CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_item
  ON public.order_item_modifiers (order_item_id);
CREATE INDEX IF NOT EXISTS idx_tenants_owner
  ON public.tenants (owner_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ Listo. Verifica con una ventana de incógnito:
--    - GET /rest/v1/orders        → [] (antes devolvía todos los pedidos)
--    - GET /rest/v1/tenants       → [] (antes devolvía todos los locales)
--    - GET /rest/v1/tenants_public → solo datos de vitrina
-- ═══════════════════════════════════════════════════════════════════════════

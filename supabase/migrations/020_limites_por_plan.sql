-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — 020 Límites por plan, iguales a lo que promete la landing
-- Run in: Supabase Dashboard > SQL Editor > New Query  (después de 019). Idempotente.
--
--                     Sin plan  Básico   Starter   Pro      Enterprise
--   Pedidos por día      40       40     ∞         ∞        ∞
--   Productos activos    15       15     100       ∞        ∞
--   Medios de pago      efectivo/transf.  ídem     + tarjeta/QR, online
--   Caja                 —        —       ✓         ✓        ✓
--   Equipo (encargado, cocina)   —        —         —        ✓
--   (La prueba de 14 días cuenta como Starter, igual que antes.)
--
-- Antes la base solo frenaba al local SIN plan: el Plan Básico tenía caja,
-- pedidos ilimitados y hasta podía cobrar con tarjeta. El código del panel
-- (src/lib/plans.ts) usa exactamente estas mismas reglas.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Orden de los planes y plan vigente de un local ───────────────────────
CREATE OR REPLACE FUNCTION public.plan_rank(p_plan TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_plan
    WHEN 'basico' THEN 1
    WHEN 'starter' THEN 2
    WHEN 'pro' THEN 3
    WHEN 'enterprise' THEN 4
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_plan(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.effective_plan(plan_id, subscription_status, trial_ends_at, subscription_expires_at)
    FROM public.tenants WHERE id = p_tenant_id;
$$;
REVOKE ALL ON FUNCTION public.tenant_plan(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_plan(UUID) TO authenticated;

-- ── 2. Pedidos: 40 por día también en Básico; tarjeta/QR solo desde Pro ─────
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
    -- Básico y Starter: efectivo y transferencia. Tarjeta/QR en caja y pago online, desde Pro
    -- (una cuenta de Mercado Pago que quedó conectada no habilita cobrar online si el plan bajó).
    IF public.plan_rank(v_plan) < public.plan_rank('pro') AND p_payment_method NOT IN ('cash', 'transfer') THEN
      RAISE EXCEPTION 'PAYMENT_METHOD_NOT_ALLOWED';
    END IF;
    IF p_payment_method = 'online' AND NOT v_tenant.has_online THEN
      RAISE EXCEPTION 'PAYMENT_METHOD_NOT_ALLOWED';
    END IF;

    -- Sin plan y Básico: hasta 40 pedidos por día (Starter en adelante, sin límite)
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

-- ── 3. Productos: tope por plan al crear o reactivar ─────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_product_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan  TEXT;
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  -- Solo cuenta lo que queda visible: crear un producto o sacarlo del archivo
  IF NEW.is_archived OR (TG_OP = 'UPDATE' AND NOT OLD.is_archived) THEN
    RETURN NEW;
  END IF;
  IF NEW.tenant_id = 'a0000000-0000-0000-0000-000000000001' THEN
    RETURN NEW; -- demo pública
  END IF;

  v_plan := public.tenant_plan(NEW.tenant_id);
  v_limit := CASE
    WHEN public.plan_rank(v_plan) >= public.plan_rank('pro') THEN NULL
    WHEN public.plan_rank(v_plan) >= public.plan_rank('starter') THEN 100
    ELSE 15
  END;
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.products
   WHERE tenant_id = NEW.tenant_id AND NOT is_archived AND id <> NEW.id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PRODUCT_LIMIT: Tu plan permite hasta % productos activos.', v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_product_limit ON public.products;
CREATE TRIGGER trg_enforce_product_limit
  BEFORE INSERT OR UPDATE OF is_archived ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_limit();

-- ── 4. Equipo: los invitados entran solo si el local tiene Enterprise ───────
-- El dueño siempre entra. Si el plan baja, encargados y cocina pierden el acceso
-- (vuelven a entrar solos cuando el plan se reactiva: su membresía no se borra).
CREATE OR REPLACE FUNCTION public.member_tenants(p_roles TEXT[] DEFAULT NULL)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.tenant_id
    FROM public.tenant_members m
   WHERE m.user_id = (SELECT auth.uid())
     AND (p_roles IS NULL OR m.role = ANY (p_roles))
     AND (m.role = 'dueno' OR public.plan_rank(public.tenant_plan(m.tenant_id)) >= public.plan_rank('enterprise'));
$$;
REVOKE ALL ON FUNCTION public.member_tenants(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_tenants(TEXT[]) TO authenticated;

-- ── 5. Caja: desde Starter ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "managers_all_cash_sessions" ON public.cash_sessions;
CREATE POLICY "managers_all_cash_sessions" ON public.cash_sessions FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado']))
    AND public.plan_rank(public.tenant_plan(tenant_id)) >= public.plan_rank('starter')
  )
  WITH CHECK (
    tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado']))
    AND public.plan_rank(public.tenant_plan(tenant_id)) >= public.plan_rank('starter')
  );

DROP POLICY IF EXISTS "managers_all_cash_withdrawals" ON public.cash_withdrawals;
CREATE POLICY "managers_all_cash_withdrawals" ON public.cash_withdrawals FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado']))
    AND public.plan_rank(public.tenant_plan(tenant_id)) >= public.plan_rank('starter')
  )
  WITH CHECK (
    tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado']))
    AND public.plan_rank(public.tenant_plan(tenant_id)) >= public.plan_rank('starter')
  );

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ Verifica:  select slug, public.tenant_plan(id) from tenants;
-- ═══════════════════════════════════════════════════════════════════════════

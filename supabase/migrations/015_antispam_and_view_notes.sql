-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — 015 Antispam de pedidos + notas de la vista pública
-- Run in: Supabase Dashboard > SQL Editor > New Query  (después de 013 y 014)
--
-- 1. create_order(): tope de pedidos "Por Pagar" recientes, para que un anónimo
--    no pueda inundar la cocina de un local (los planes de pago no tenían tope).
-- 2. tenants_public: documenta por qué es SECURITY DEFINER (alerta del linter de
--    Supabase "Security Definer View") y la marca como security_barrier.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. create_order con antispam ─────────────────────────────────────────────
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

-- ── 2. Vista pública ─────────────────────────────────────────────────────────
-- La vista DEBE ser SECURITY DEFINER (el comportamiento por defecto de las vistas
-- en Postgres): `tenants` ya no es legible por anon/authenticated (tiene datos
-- bancarios y de facturación), y el menú público necesita leer nombre/logo/plan.
-- Una vista security_invoker volvería a pedir SELECT sobre la tabla y rompería el menú
-- para clientes y para dueños que miran el menú de otro local.
-- Expone SOLO: id, slug, name, logo_url, description, phone, address, effective_plan.
ALTER VIEW public.tenants_public SET (security_barrier = true);
COMMENT ON VIEW public.tenants_public IS
  'Datos públicos de vitrina de un local. SECURITY DEFINER a propósito (ver migración 015): es la única vía anónima para leer tenants y no expone owner, facturación ni datos bancarios.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — 016 Funciones Pro
-- Run in: Supabase Dashboard > SQL Editor > New Query  (después de 013-015)
--
--  1. Costo por producto y margen      → products.cost, order_items.unit_cost
--  2. Alertas de reposición con costo  → products.restock_target
--  3. Tiempos de preparación           → orders.*_at + trigger de estados
--  4. Aviso de "pedido listo"          → push_subscriptions, whatsapp_links
--  5. Pagos online (Mercado Pago)      → tenant_payment_accounts, orders.paid_online
--  6. create_order / get_order_public / tenants_public actualizados
--
-- Las tablas nuevas tienen RLS activado y SIN policies: solo el service role
-- (rutas /api del servidor) puede leerlas o escribirlas.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1-2. Costos ──────────────────────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost           NUMERIC(10,2) CHECK (cost IS NULL OR cost >= 0),
  ADD COLUMN IF NOT EXISTS restock_target INTEGER       CHECK (restock_target IS NULL OR restock_target >= 0);

-- Costo unitario "congelado" al momento de la venta: el margen histórico no cambia
-- si después se edita el costo del producto.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10,2);

-- ── 3. Tiempos de preparación ────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmed_at      TIMESTAMPTZ,   -- pago confirmado (→ Pendiente)
  ADD COLUMN IF NOT EXISTS preparing_at      TIMESTAMPTZ,   -- → En preparación
  ADD COLUMN IF NOT EXISTS ready_at          TIMESTAMPTZ,   -- → Listo
  ADD COLUMN IF NOT EXISTS delivered_at      TIMESTAMPTZ,   -- → Entregado
  ADD COLUMN IF NOT EXISTS paid_online       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_payment_id TEXT;

CREATE OR REPLACE FUNCTION public.set_order_status_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'Pendiente'      THEN NEW.confirmed_at := COALESCE(NEW.confirmed_at, now()); END IF;
    IF NEW.status = 'En preparación' THEN NEW.preparing_at := COALESCE(NEW.preparing_at, now()); END IF;
    IF NEW.status = 'Listo'          THEN NEW.ready_at     := COALESCE(NEW.ready_at, now());     END IF;
    IF NEW.status = 'Entregado'      THEN NEW.delivered_at := COALESCE(NEW.delivered_at, now()); END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_status_timestamps ON public.orders;
CREATE TRIGGER trg_order_status_timestamps
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_status_timestamps();

-- ── 4. Aviso de pedido listo ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL UNIQUE,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_order ON public.push_subscriptions (order_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- El cliente toca "Avísame por WhatsApp" → se abre un chat con un código "HA-XXXXXXXX".
-- Cuando llega ese mensaje (ventana de 24 h abierta por el cliente → la respuesta es gratis)
-- se vincula el teléfono. El número se borra apenas se envía el aviso.
CREATE TABLE IF NOT EXISTS public.whatsapp_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE,
  wa_id       TEXT,
  linked_at   TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_links_order ON public.whatsapp_links (order_id);
ALTER TABLE public.whatsapp_links ENABLE ROW LEVEL SECURITY;

-- ── 5. Pagos online: cuenta de Mercado Pago de cada local ────────────────────
-- Los tokens se guardan CIFRADOS por la app (AES-256-GCM); la base nunca ve el texto plano.
CREATE TABLE IF NOT EXISTS public.tenant_payment_accounts (
  tenant_id         UUID        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider          TEXT        NOT NULL DEFAULT 'mercadopago',
  mp_user_id        TEXT,
  access_token_enc  TEXT        NOT NULL,
  refresh_token_enc TEXT,
  expires_at        TIMESTAMPTZ,
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_payment_accounts ENABLE ROW LEVEL SECURITY;

-- ── 6a. Vista pública: ahora también indica si el local cobra online ─────────
-- (CREATE OR REPLACE VIEW solo permite agregar columnas al final)
CREATE OR REPLACE VIEW public.tenants_public AS
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
    ) AS effective_plan,
    EXISTS (
      SELECT 1 FROM public.tenant_payment_accounts a WHERE a.tenant_id = t.id
    ) AS online_payments
  FROM public.tenants t;

ALTER VIEW public.tenants_public SET (security_barrier = true);
GRANT SELECT ON public.tenants_public TO anon, authenticated;

-- ── 6b. create_order: guarda unit_cost y acepta pago 'online' ────────────────
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
  IF p_payment_method NOT IN ('cash', 'transfer', 'card', 'qr', 'online') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD';
  END IF;
  IF p_order_type NOT IN ('aqui', 'llevar') THEN
    RAISE EXCEPTION 'INVALID_ORDER_TYPE';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 40 THEN
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

  v_plan := public.effective_plan(
    v_tenant.plan_id, v_tenant.subscription_status,
    v_tenant.trial_ends_at, v_tenant.subscription_expires_at
  );

  IF v_tenant.id <> c_demo THEN
    -- Tarjeta y QR solo en planes superiores (misma regla que el carrito)
    IF v_plan IN ('gratis', 'starter') AND p_payment_method NOT IN ('cash', 'transfer') THEN
      RAISE EXCEPTION 'PAYMENT_METHOD_NOT_ALLOWED';
    END IF;
    -- Pago online: solo si el local conectó su cuenta de Mercado Pago
    IF p_payment_method = 'online' AND NOT v_tenant.has_online THEN
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
    SELECT id, name, price, cost, stock, is_available, is_archived
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

    INSERT INTO public.order_items (order_id, product_id, product_name, price, quantity, unit_cost)
    VALUES (v_order_id, v_prod.id, v_prod.name, v_unit, v_qty, v_prod.cost)
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

-- ── 6c. get_order_public: avisos, pago online y estado de pago ───────────────
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
  v_plan     TEXT;
  v_notify   BOOLEAN;
BEGIN
  SELECT id, tenant_id, nickname, pickup_code, short_id, status,
         payment_method, order_type, total, created_at, paid_online
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

  SELECT public.effective_plan(plan_id, subscription_status, trial_ends_at, subscription_expires_at)
    INTO v_plan
    FROM public.tenants WHERE id = v_order.tenant_id;
  -- Avisos de "pedido listo": plan Pro o superior (y la demo, para poder mostrarlos)
  v_notify := v_plan IN ('pro', 'enterprise')
              OR v_order.tenant_id = 'a0000000-0000-0000-0000-000000000001';

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
    'transfer', v_transfer,
    'paid_online', v_order.paid_online,
    'notify_enabled', v_notify
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_public(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_public(UUID) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ Listo. Verifica: select cost, restock_target from products limit 1;
-- ═══════════════════════════════════════════════════════════════════════════

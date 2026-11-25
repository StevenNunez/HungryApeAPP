-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — 019 Equipo: miembros y roles por local
-- Run in: Supabase Dashboard > SQL Editor > New Query  (después de 018). Idempotente.
-- Aplicar JUNTO con el deploy del código nuevo (el panel lee el local desde
-- tenant_members; si esta migración falta, el código cae al modo "solo dueño").
--
-- ANTES: un local = una cuenta. Quien atendía la cocina entraba con la cuenta del
-- dueño y veía caja, reportes y facturación.
-- AHORA: cada local tiene miembros con un rol:
--   dueno     → todo (facturación, configuración, equipo). Es tenants.owner_id.
--   encargado → menú, cocina, caja, reportes, QR. Sin facturación ni equipo.
--   cocina    → solo la cocina (ver pedidos y moverlos de estado).
-- Una cuenta pertenece a un solo local (igual que antes: UNIQUE user_id).
--
-- Todas las políticas que decían "tenant del que soy dueño" pasan a usar
-- public.member_tenants(roles), con (select auth.uid()) para que se evalúe una
-- vez por consulta y no por fila.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Miembros ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_members (
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('dueno', 'encargado', 'cocina')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_members_one_tenant_per_user ON public.tenant_members (user_id);
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

-- Cada dueño actual pasa a ser miembro "dueno" de su local (la demo pública
-- tiene un dueño ficticio que no existe en auth.users: se salta).
INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT t.id, t.owner_id, 'dueno'
  FROM public.tenants t
  JOIN auth.users u ON u.id = t.owner_id
ON CONFLICT DO NOTHING;

-- Al crear un local, su dueño queda como miembro automáticamente
CREATE OR REPLACE FUNCTION public.add_owner_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.owner_id) THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'dueno')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_owner_membership ON public.tenants;
CREATE TRIGGER trg_add_owner_membership
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.add_owner_membership();

-- Locales de la cuenta actual con alguno de esos roles (todos si p_roles es NULL).
-- SECURITY DEFINER: lee tenant_members sin depender de sus propias políticas.
CREATE OR REPLACE FUNCTION public.member_tenants(p_roles TEXT[] DEFAULT NULL)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
    FROM public.tenant_members
   WHERE user_id = (SELECT auth.uid())
     AND (p_roles IS NULL OR role = ANY (p_roles));
$$;
REVOKE ALL ON FUNCTION public.member_tenants(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_tenants(TEXT[]) TO authenticated;

-- Cada persona ve su propia membresía; el dueño ve las de su local.
DROP POLICY IF EXISTS "Members read memberships" ON public.tenant_members;
CREATE POLICY "Members read memberships"
  ON public.tenant_members FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT public.member_tenants(ARRAY['dueno']))
  );
-- Altas y bajas: solo el servidor (/api/equipo), después de verificar al dueño.

-- ── 2. Invitaciones ─────────────────────────────────────────────────────────
-- El enlace lleva un token al azar; acá solo se guarda su hash. Vence a los 7 días.
CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email       TEXT NOT NULL CHECK (email = lower(email) AND position('@' in email) > 1),
  role        TEXT NOT NULL CHECK (role IN ('encargado', 'cocina')),
  token_hash  TEXT NOT NULL UNIQUE,
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant ON public.tenant_invitations (tenant_id, created_at DESC);
ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo el servidor las lee y escribe.

-- ── 3. Políticas reescritas con membresía ───────────────────────────────────
-- TENANTS: cualquier miembro lee su local; solo el dueño lo modifica o borra.
DROP POLICY IF EXISTS "Owners can read their tenant" ON public.tenants;
CREATE POLICY "Members can read their tenant"
  ON public.tenants FOR SELECT
  USING (id IN (SELECT public.member_tenants()) OR owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owners can update their tenant" ON public.tenants;
CREATE POLICY "Owners can update their tenant"
  ON public.tenants FOR UPDATE
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owners can delete their tenant" ON public.tenants;
CREATE POLICY "Owners can delete their tenant"
  ON public.tenants FOR DELETE
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can create a tenant" ON public.tenants;
CREATE POLICY "Authenticated users can create a tenant"
  ON public.tenants FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND owner_id = (SELECT auth.uid()));

-- PRODUCTS: dueño y encargado administran (la lectura pública del menú sigue igual)
DROP POLICY IF EXISTS "Owners can manage their products" ON public.products;
CREATE POLICY "Managers can manage their products"
  ON public.products FOR ALL
  TO authenticated
  USING (tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado'])))
  WITH CHECK (tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado'])));

DROP POLICY IF EXISTS "Owners manage their product costs" ON public.product_private;
CREATE POLICY "Managers manage their product costs"
  ON public.product_private FOR ALL
  TO authenticated
  USING (tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado'])))
  WITH CHECK (
    tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado']))
    AND product_id IN (SELECT id FROM public.products p WHERE p.tenant_id = product_private.tenant_id)
  );

DROP POLICY IF EXISTS "owner_modifier_groups" ON public.product_modifier_groups;
CREATE POLICY "managers_modifier_groups" ON public.product_modifier_groups FOR ALL
  TO authenticated
  USING (tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado'])))
  WITH CHECK (tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado'])));

DROP POLICY IF EXISTS "owner_modifier_options" ON public.product_modifier_options;
CREATE POLICY "managers_modifier_options" ON public.product_modifier_options FOR ALL
  TO authenticated
  USING (tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado'])))
  WITH CHECK (tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado'])));

-- ORDERS: todo el equipo ve y mueve los pedidos (la cocina los necesita)
DROP POLICY IF EXISTS "Owners can read their orders" ON public.orders;
CREATE POLICY "Members can read their orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT public.member_tenants()));

DROP POLICY IF EXISTS "Owners can update their orders" ON public.orders;
CREATE POLICY "Members can update their orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (tenant_id IN (SELECT public.member_tenants()))
  WITH CHECK (tenant_id IN (SELECT public.member_tenants()));

DROP POLICY IF EXISTS "Owners can read their order items" ON public.order_items;
CREATE POLICY "Members can read their order items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (order_id IN (SELECT o.id FROM public.orders o WHERE o.tenant_id IN (SELECT public.member_tenants())));

DROP POLICY IF EXISTS "owner_select_order_item_modifiers" ON public.order_item_modifiers;
CREATE POLICY "members_select_order_item_modifiers" ON public.order_item_modifiers FOR SELECT
  TO authenticated
  USING (
    order_item_id IN (
      SELECT oi.id FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE o.tenant_id IN (SELECT public.member_tenants())
    )
  );

-- CAJA: dueño y encargado
DROP POLICY IF EXISTS "owner_all_cash_sessions" ON public.cash_sessions;
CREATE POLICY "managers_all_cash_sessions" ON public.cash_sessions FOR ALL
  TO authenticated
  USING (tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado'])))
  WITH CHECK (tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado'])));

DROP POLICY IF EXISTS "owner_all_cash_withdrawals" ON public.cash_withdrawals;
CREATE POLICY "managers_all_cash_withdrawals" ON public.cash_withdrawals FOR ALL
  TO authenticated
  USING (tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado'])))
  WITH CHECK (tenant_id IN (SELECT public.member_tenants(ARRAY['dueno', 'encargado'])));

-- FOTOS: dueño y encargado, solo en la carpeta de su local
DROP POLICY IF EXISTS "Owners upload images to their tenant folder" ON storage.objects;
DROP POLICY IF EXISTS "Owners update images in their tenant folder" ON storage.objects;
DROP POLICY IF EXISTS "Owners delete images in their tenant folder" ON storage.objects;

CREATE POLICY "Managers upload images to their tenant folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] IN (SELECT t::text FROM public.member_tenants(ARRAY['dueno', 'encargado']) t)
  );

CREATE POLICY "Managers update images in their tenant folder"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] IN (SELECT t::text FROM public.member_tenants(ARRAY['dueno', 'encargado']) t)
  )
  WITH CHECK (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] IN (SELECT t::text FROM public.member_tenants(ARRAY['dueno', 'encargado']) t)
  );

CREATE POLICY "Managers delete images in their tenant folder"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] IN (SELECT t::text FROM public.member_tenants(ARRAY['dueno', 'encargado']) t)
  );

-- ── 4. Restricciones que faltaban (limpieza de la auditoría) ─────────────────
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_price_check;
ALTER TABLE public.products ADD CONSTRAINT products_price_check CHECK (price >= 0) NOT VALID;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_stock_check;
ALTER TABLE public.products ADD CONSTRAINT products_stock_check CHECK (stock >= 0) NOT VALID;
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_quantity_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_quantity_check CHECK (quantity > 0) NOT VALID;
ALTER TABLE public.cash_sessions DROP CONSTRAINT IF EXISTS cash_sessions_status_check;
ALTER TABLE public.cash_sessions ADD CONSTRAINT cash_sessions_status_check CHECK (status IN ('open', 'closed')) NOT VALID;
ALTER TABLE public.cash_withdrawals DROP CONSTRAINT IF EXISTS cash_withdrawals_amount_check;
ALTER TABLE public.cash_withdrawals ADD CONSTRAINT cash_withdrawals_amount_check CHECK (amount > 0) NOT VALID;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ Verifica:  select role, count(*) from tenant_members group by role;
--    (debería haber un 'dueno' por cada local con dueño real)
-- ═══════════════════════════════════════════════════════════════════════════

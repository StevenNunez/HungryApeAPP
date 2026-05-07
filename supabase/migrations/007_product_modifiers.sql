-- ═══════════════════════════════════════════════════════════════════════════
-- 🦍 HUNGRY APE — Product modifiers (salsas, extras, quitar ingredientes)
-- ═══════════════════════════════════════════════════════════════════════════

-- Groups: "Salsas", "Ingredientes a quitar", "Punto de cocción", etc.
CREATE TABLE IF NOT EXISTS public.product_modifier_groups (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID    NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tenant_id   UUID    NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'checkbox'
    CHECK (type IN ('checkbox', 'radio')),
  required    BOOLEAN NOT NULL DEFAULT false,
  sort_order  INT     NOT NULL DEFAULT 0
);

-- Options within a group: "Mayonesa", "Sin palta", "Bien cocido", etc.
CREATE TABLE IF NOT EXISTS public.product_modifier_options (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID         NOT NULL REFERENCES public.product_modifier_groups(id) ON DELETE CASCADE,
  tenant_id   UUID         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  price_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order  INT          NOT NULL DEFAULT 0
);

-- What the customer chose per order item (snapshots for history)
CREATE TABLE IF NOT EXISTS public.order_item_modifiers (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id  UUID         NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  option_id      UUID,        -- nullable: option may be deleted later
  option_name    TEXT         NOT NULL,
  group_name     TEXT         NOT NULL,
  price_delta    NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- RLS
ALTER TABLE public.product_modifier_groups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_modifier_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_modifiers     ENABLE ROW LEVEL SECURITY;

-- product_modifier_groups: tenant owner + public read for customer menu
CREATE POLICY "owner_modifier_groups" ON public.product_modifier_groups FOR ALL
  USING (tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid()));
CREATE POLICY "public_read_modifier_groups" ON public.product_modifier_groups FOR SELECT
  USING (true);

-- product_modifier_options: same pattern
CREATE POLICY "owner_modifier_options" ON public.product_modifier_options FOR ALL
  USING (tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid()));
CREATE POLICY "public_read_modifier_options" ON public.product_modifier_options FOR SELECT
  USING (true);

-- order_item_modifiers: anyone can insert (customer placing order), owner reads
CREATE POLICY "public_insert_order_item_modifiers" ON public.order_item_modifiers FOR INSERT
  WITH CHECK (true);
CREATE POLICY "owner_select_order_item_modifiers" ON public.order_item_modifiers FOR SELECT
  USING (
    order_item_id IN (
      SELECT oi.id FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      JOIN public.tenants t ON t.id = o.tenant_id
      WHERE t.owner_id = auth.uid()
    )
  );

/**
 * Supplies by recipe against the real database (Pro demo business). Skips itself
 * until migration 021 is applied. Creates a test product and supply, then archives them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const envFile = path.resolve(__dirname, '../../.env.local');
const env: Record<string, string> = fs.existsSync(envFile)
  ? Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.trim().startsWith('#'))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }))
  : {};
const ready = !!(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const SLUG = 'hungry-ape-pro-demo';

let service: SupabaseClient;
let anon: SupabaseClient;
let has021 = false;
let tenantId = '';
let productId = '';
let supplyId = '';
const orders: string[] = [];

const supplyStock = async () => Number((await service.from('supplies').select('stock').eq('id', supplyId).single()).data!.stock);
const productStock = async () => (await service.from('products').select('stock, is_available').eq('id', productId).single()).data!;

describe.skipIf(!ready)('insumos por receta (base real, demo Pro)', () => {
  beforeAll(async () => {
    service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
    anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
    has021 = !(await service.from('supplies').select('id').limit(1)).error;
    if (!has021) return;
    tenantId = (await service.from('tenants').select('id').eq('slug', SLUG).single()).data!.id;
    productId = (await service.from('products').insert({
      tenant_id: tenantId, name: '[prueba] Completo de prueba', description: '', price: 1000, category: 'Pruebas', stock: 0, is_available: false,
    }).select('id').single()).data!.id;
    supplyId = (await service.from('supplies').insert({
      tenant_id: tenantId, name: `[prueba] Pan ${Date.now()}`, unit: 'unidad', stock: 5, min_stock: 1, cost_per_unit: 200,
    }).select('id').single()).data!.id;
    await service.from('product_recipes').insert({ tenant_id: tenantId, product_id: productId, supply_id: supplyId, quantity: 1 });
    await service.rpc('refresh_recipe_stock', { p_tenant_id: tenantId });
  }, 30_000);

  afterAll(async () => {
    if (!has021) return;
    for (const id of orders) await service.rpc('cancel_order', { p_order_id: id, p_reason: 'prueba' });
    await service.from('product_recipes').delete().eq('product_id', productId);
    await service.from('products').update({ is_archived: true, is_available: false }).eq('id', productId);
    await service.from('supplies').update({ is_archived: true }).eq('id', supplyId);
  }, 30_000);

  it('el producto con receta toma su stock de los insumos', async ctx => {
    if (!has021) return ctx.skip();
    expect(await productStock()).toEqual({ stock: 5, is_available: true });
  });

  it('un pedido sin pagar reserva; al pagarse descuenta el insumo y queda en el historial', async ctx => {
    if (!has021) return ctx.skip();
    const { data, error } = await anon.rpc('create_order', {
      p_tenant_slug: SLUG, p_nickname: 'Prueba insumos', p_payment_method: 'cash', p_order_type: 'aqui',
      p_items: [{ product_id: productId, quantity: 2, option_ids: [] }],
    });
    expect(error).toBeNull();
    const orderId = (data as any).id;
    orders.push(orderId);

    expect(await supplyStock()).toBe(5);             // still not paid: supply untouched
    expect((await productStock()).stock).toBe(3);    // but 2 are reserved

    await service.from('orders').update({ status: 'Pendiente' }).eq('id', orderId);
    expect(await supplyStock()).toBe(3);
    const { data: mov } = await service.from('supply_movements').select('kind, quantity').eq('order_id', orderId);
    expect(mov).toEqual([{ kind: 'venta', quantity: -2 }]);
    const { data: item } = await service.from('order_items').select('unit_cost').eq('order_id', orderId).single();
    expect(Number(item!.unit_cost)).toBe(200); // cost frozen from the recipe
  });

  it('al anular, el insumo vuelve', async ctx => {
    if (!has021) return ctx.skip();
    const orderId = orders[0];
    const { data: ok } = await service.rpc('cancel_order', { p_order_id: orderId, p_reason: 'prueba' });
    expect(ok).toBe(true);
    expect(await supplyStock()).toBe(5);
    expect((await productStock()).stock).toBe(5);
  });

  it('dos productos que comparten insumo no pueden pedir más de lo que hay', async ctx => {
    if (!has021) return ctx.skip();
    // Second product using the same bread; only 1 bread left
    const { data: p2 } = await service.from('products').insert({
      tenant_id: tenantId, name: '[prueba] Salchipapa de prueba', description: '', price: 1000, category: 'Pruebas', stock: 0, is_available: false,
    }).select('id').single();
    await service.from('product_recipes').insert({ tenant_id: tenantId, product_id: p2!.id, supply_id: supplyId, quantity: 1 });
    await service.from('supplies').update({ stock: 1 }).eq('id', supplyId);
    await service.rpc('refresh_recipe_stock', { p_tenant_id: tenantId });

    const { error } = await anon.rpc('create_order', {
      p_tenant_slug: SLUG, p_nickname: 'Prueba compartido', p_payment_method: 'cash', p_order_type: 'aqui',
      p_items: [{ product_id: productId, quantity: 1, option_ids: [] }, { product_id: p2!.id, quantity: 1, option_ids: [] }],
    });
    expect(error?.message).toMatch(/OUT_OF_STOCK/);

    await service.from('product_recipes').delete().eq('product_id', p2!.id);
    await service.from('products').update({ is_archived: true, is_available: false }).eq('id', p2!.id);
    await service.from('supplies').update({ stock: 5 }).eq('id', supplyId);
  });

  it('cuando se acaba el insumo, el producto se agota solo', async ctx => {
    if (!has021) return ctx.skip();
    await service.from('supplies').update({ stock: 0 }).eq('id', supplyId);
    await service.rpc('refresh_recipe_stock', { p_tenant_id: tenantId });
    expect(await productStock()).toEqual({ stock: 0, is_available: false });
  });
});

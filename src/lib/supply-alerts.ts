import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { escapeHtml, sendEmail, smtpConfigured, teoLabsSignature } from '@/lib/email';
import { anotarError } from '@/lib/errores-servidor';
import { formatQtyShort, toBuy, type SupplyUnit } from '@/lib/insumos';

type LowSupply = { name: string; unit: SupplyUnit; stock: number; min_stock: number; target_stock: number | null };

/**
 * After a payment is confirmed (supplies were just deducted), email the owner the
 * supplies that dropped to or below their minimum. The database marks each one, so
 * it's sent once per drop; restocking above the minimum re-arms it.
 * Never throws: an alert can't break the kitchen.
 */
export async function notifyLowSupplies(tenantId: string): Promise<void> {
  try {
    if (!smtpConfigured()) return;
    const service = createServiceSupabaseClient() as any;
    const { data, error } = await service.rpc('take_low_supply_alerts', { p_tenant_id: tenantId });
    if (error) {
      // Before migration 021 the function doesn't exist: nothing to warn about
      if (!/PGRST202|42883|schema cache/i.test(`${error.code} ${error.message}`)) throw error;
      return;
    }
    const low = ((data ?? []) as any[]).map(r => ({
      name: r.name, unit: r.unit, stock: Number(r.stock), min_stock: Number(r.min_stock),
      target_stock: r.target_stock === null ? null : Number(r.target_stock),
    })) as LowSupply[];
    if (low.length === 0) return;

    const { data: tenant } = await service.from('tenants').select('name, logo_url, owner_id').eq('id', tenantId).single();
    const { data: owner } = await service.auth.admin.getUserById(tenant.owner_id);
    const to = owner?.user?.email;
    if (!to) return;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ape.teolabs.app';
    await sendEmail({ to, ...buildLowSupplyEmail(tenant, low, `${appUrl}/dashboard/insumos`, appUrl) });
  } catch (e) {
    await anotarError({ origen: 'servidor', donde: 'aviso de insumos bajos', error: e, tenantId });
  }
}

export function buildLowSupplyEmail(
  tenant: { name: string; logo_url: string | null },
  low: LowSupply[],
  link: string,
  appUrl: string,
) {
  const name = escapeHtml(tenant.name);
  const out = low.filter(s => s.stock <= 0).length;
  const subject = out > 0
    ? `${tenant.name}: se acabó ${low.find(s => s.stock <= 0)!.name}${low.length > 1 ? ` y ${low.length - 1} insumo(s) más están bajos` : ''}`
    : `${tenant.name}: quedan pocos ${low.map(s => s.name).slice(0, 2).join(' y ')}${low.length > 2 ? '…' : ''}`;
  const preheader = `Repón ${low.map(s => s.name).join(', ')} para no quedarte sin stock.`;

  const rows = low.map(s => {
    const buy = toBuy(s);
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #e5eef1;font-weight:700;">${escapeHtml(s.name)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e5eef1;text-align:right;color:${s.stock <= 0 ? '#b91c1c' : '#92400e'};font-weight:700;">${s.stock <= 0 ? 'Sin stock' : `Quedan ${escapeHtml(formatQtyShort(s.stock, s.unit))}`}</td>
      <td style="padding:8px 0 8px 12px;border-bottom:1px solid #e5eef1;text-align:right;color:#4b5563;">${buy ? `Comprar ${escapeHtml(formatQtyShort(buy, s.unit))}` : `Mínimo ${escapeHtml(formatQtyShort(s.min_stock, s.unit))}`}</td>
    </tr>`;
  }).join('');

  const logo = tenant.logo_url
    ? `<img src="${escapeHtml(tenant.logo_url)}" width="44" height="44" alt="${name}" style="display:block;width:44px;height:44px;border-radius:10px;border:0;">`
    : `<div style="width:44px;height:44px;border-radius:10px;background:#be1e36;color:#fff;font-size:20px;font-weight:800;line-height:44px;text-align:center;">${escapeHtml(tenant.name.slice(0, 1).toUpperCase())}</div>`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef6f8;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
<span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef6f8;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #d5e3e7;">
  <tr><td style="background:#1a1a1a;padding:18px 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:12px;">${logo}</td>
      <td><p style="margin:0;font-size:17px;font-weight:800;color:#fff;">${name}</p>
      <p style="margin:2px 0 0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#a8dde8;">Insumos · Hungry Ape</p></td>
    </tr></table>
  </td></tr>
  <tr><td style="height:5px;background:#be1e36;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:24px;">
    <h1 style="margin:0 0 8px;font-size:20px;">${out > 0 ? 'Se te acabó un insumo' : 'Te quedan pocos insumos'}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563;">Con las últimas ventas, estos quedaron en o bajo el mínimo que definiste. ${out > 0 ? 'Los productos que los usan ya no se pueden pedir hasta que registres la compra.' : 'Repónlos antes de que se agoten los productos que los usan.'}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${rows}</table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px;"><tr><td style="border-radius:12px;background:#be1e36;">
      <a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 26px;font-size:16px;font-weight:700;color:#fff;text-decoration:none;border-radius:12px;">Ver mis insumos</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:14px 24px;border-top:1px solid #e5eef1;font-size:12px;line-height:1.7;color:#6b7280;">
    Este aviso sale una vez por insumo; vuelve a activarse cuando lo repones.<br>
    Enviado desde <a href="${escapeHtml(appUrl)}" style="color:#6b7280;">Hungry Ape</a><br>
    ${teoLabsSignature()}
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    out > 0 ? 'Se te acabó un insumo' : 'Te quedan pocos insumos',
    '',
    ...low.map(s => {
      const buy = toBuy(s);
      return `- ${s.name}: ${s.stock <= 0 ? 'sin stock' : `quedan ${formatQtyShort(s.stock, s.unit)}`}${buy ? ` (comprar ${formatQtyShort(buy, s.unit)})` : ''}`;
    }),
    '',
    `Ver mis insumos: ${link}`,
    '',
    `${tenant.name} · Enviado desde Hungry Ape`,
    'Desarrollado por Teo Labs ® — https://www.teolabs.app',
  ].join('\n');

  return { subject, html, text, fromName: `${tenant.name} vía Hungry Ape` };
}

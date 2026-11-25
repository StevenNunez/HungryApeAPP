import { escapeHtml, sendEmail, teoLabsSignature } from '@/lib/email';
import { ROLE_LABEL, ROLE_DESCRIPTION } from '@/lib/roles';

export interface InvitationEmailParams {
  to: string;
  link: string;
  role: 'encargado' | 'cocina';
  expiresAt: Date;
  tenant: { name: string; logo_url: string | null; address: string | null; phone: string | null; slug: string };
  inviterEmail: string | null;
  appUrl: string;
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago' });

/**
 * Team invitation: it comes from the BUSINESS (its logo and name in the header),
 * sent through Hungry Ape, signed by Teo Labs. Table layout with inline styles
 * (Gmail/Outlook ignore <style>, flex and SVG), hidden preview text and plain text.
 * Reply-To = the person who invited, so questions go to them.
 */
export async function sendInvitationEmail(p: InvitationEmailParams) {
  const name = escapeHtml(p.tenant.name);
  const role = ROLE_LABEL[p.role];
  const roleDesc = ROLE_DESCRIPTION[p.role];
  const expires = fmtDate(p.expiresAt);
  const menuUrl = `${p.appUrl}/m/${p.tenant.slug}`;
  const preheader = `${p.tenant.name} te invita a su equipo en Hungry Ape (${role}).`;

  const logo = p.tenant.logo_url
    ? `<img src="${escapeHtml(p.tenant.logo_url)}" width="48" height="48" alt="${name}" style="display:block;width:48px;height:48px;border-radius:12px;border:0;object-fit:cover;">`
    : `<div style="width:48px;height:48px;border-radius:12px;background:#be1e36;color:#ffffff;font-size:22px;font-weight:800;line-height:48px;text-align:center;">${escapeHtml(p.tenant.name.slice(0, 1).toUpperCase())}</div>`;

  const footerLines = [
    `<strong style="color:#1a1a1a;">${name}</strong>`,
    p.tenant.address ? escapeHtml(p.tenant.address) : null,
    p.tenant.phone ? escapeHtml(p.tenant.phone) : null,
    `<a href="${escapeHtml(menuUrl)}" style="color:#be1e36;text-decoration:none;">Ver su menú</a>`,
  ].filter(Boolean).join(' · ');

  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invitación al equipo de ${name}</title></head>
<body style="margin:0;padding:0;background:#eef6f8;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
<span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef6f8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d5e3e7;">
  <tr><td style="background:#1a1a1a;padding:20px 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:14px;">${logo}</td>
      <td>
        <p style="margin:0;font-size:18px;font-weight:800;color:#ffffff;">${name}</p>
        <p style="margin:2px 0 0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#a8dde8;">Panel en Hungry Ape</p>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="height:5px;background:#be1e36;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:28px 24px 8px;">
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">Te invitaron al equipo de ${name}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4b5563;">
      ${p.inviterEmail ? `<strong style="color:#1a1a1a;">${escapeHtml(p.inviterEmail)}</strong> te sumó` : 'Te sumaron'} al panel del local para que trabajes con ellos en Hungry Ape.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6fafb;border:1px solid #d5e3e7;border-radius:12px;">
      <tr><td style="padding:16px 18px;font-size:14px;line-height:1.7;">
        <span style="color:#6b7280;">Local:</span> <strong>${name}</strong><br>
        <span style="color:#6b7280;">Tu rol:</span> <strong>${escapeHtml(role)}</strong> — ${escapeHtml(roleDesc)}<br>
        <span style="color:#6b7280;">Cuenta:</span> ${escapeHtml(p.to)}<br>
        <span style="color:#6b7280;">El enlace vence el:</span> ${escapeHtml(expires)}
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;"><tr>
      <td style="border-radius:12px;background:#be1e36;">
        <a href="${escapeHtml(p.link)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">Unirme al equipo</a>
      </td>
    </tr></table>
    <p style="margin:12px 0 24px;font-size:12px;line-height:1.5;color:#6b7280;">
      El enlace es personal: entra con este mismo correo. Si no esperabas esta invitación, ignora este mensaje.
    </p>
  </td></tr>
  <tr><td style="padding:16px 24px;border-top:1px solid #e5eef1;font-size:12px;line-height:1.7;color:#6b7280;">
    ${footerLines}<br>
    Enviado desde <a href="${escapeHtml(p.appUrl)}" style="color:#6b7280;">Hungry Ape</a><br>
    ${teoLabsSignature()}
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const text = [
    `Te invitaron al equipo de ${p.tenant.name} en Hungry Ape.`,
    '',
    `Local: ${p.tenant.name}`,
    `Tu rol: ${role} — ${roleDesc}`,
    `Cuenta: ${p.to}`,
    `El enlace vence el: ${expires}`,
    '',
    `Unirme al equipo: ${p.link}`,
    '',
    'El enlace es personal: entra con este mismo correo. Si no esperabas esta invitación, ignora este mensaje.',
    '',
    [p.tenant.name, p.tenant.address, p.tenant.phone].filter(Boolean).join(' · '),
    `Enviado desde Hungry Ape (${p.appUrl})`,
    'Desarrollado por Teo Labs ® — https://www.teolabs.app',
  ].join('\n');

  await sendEmail({
    to: p.to,
    subject: `${p.tenant.name} te invita a su equipo en Hungry Ape`,
    text,
    html,
    replyTo: p.inviterEmail ?? undefined,
    fromName: `${p.tenant.name} vía Hungry Ape`,
  });
}

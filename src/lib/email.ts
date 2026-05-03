import nodemailer from 'nodemailer';

// ─── Zoho SMTP transporter ────────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465,
    secure: true, // SSL
    auth: {
      user: process.env.ZOHO_SMTP_USER,   // hola@teolabs.app
      pass: process.env.ZOHO_SMTP_PASS,   // App password from Zoho
    },
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type PlanId = 'gratis' | 'starter' | 'pro' | 'enterprise';

const PLAN_NAMES: Record<PlanId, string> = {
  gratis: 'Gratis',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

// ─── Welcome email HTML template ─────────────────────────────────────────────
function buildWelcomeHtml(businessName: string, planId: PlanId, dashboardUrl: string): string {
  const planName = PLAN_NAMES[planId] ?? 'Gratis';
  const isFreePlan = planId === 'gratis';

  const trialBanner = isFreePlan ? `
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:12px;padding:16px 20px;margin:24px 0;text-align:center;">
      <p style="margin:0;font-size:15px;color:#92400e;font-weight:600;">
        🎉 ¡Tienes 14 días de Starter gratis activados!
      </p>
      <p style="margin:6px 0 0;font-size:13px;color:#b45309;">
        Inventario vivo, pedidos ilimitados y analíticas. Pruébalos sin límites.
      </p>
    </div>
  ` : '';

  const planBenefits: Record<PlanId, string[]> = {
    gratis: ['Hasta 15 productos en tu menú', 'Código QR único para tu local', 'Hasta 40 pedidos por día', 'Cocina en tiempo real'],
    starter: ['Hasta 100 productos en tu menú', 'Pedidos ilimitados', 'Inventario y stock en tiempo real', 'Analíticas de ventas básicas'],
    pro: ['Todo lo de Starter', 'Pagos online integrados', 'Reportes avanzados PDF/Excel', 'Notificaciones WhatsApp al cliente'],
    enterprise: ['Todo lo de Pro', 'Multi-sucursales', 'Control de insumos y recetas', 'Soporte prioritario dedicado'],
  };

  const benefitItems = (planBenefits[planId] ?? planBenefits.gratis)
    .map(b => `<li style="margin-bottom:8px;color:#374151;">✅ ${b}</li>`)
    .join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenido a Hungry Ape 🦍</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:32px 40px;text-align:center;">
              <div style="display:inline-block;background:#fbbf24;border-radius:16px;padding:6px 18px;margin-bottom:12px;">
                <span style="font-size:13px;font-weight:800;letter-spacing:2px;color:#111827;text-transform:uppercase;">Hungry 🍌 Ape</span>
              </div>
              <h1 style="margin:8px 0 0;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                ¡Tu food truck digital está listo! 🦍
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 16px;font-size:17px;color:#111827;font-weight:600;">
                Hola, <strong>${businessName}</strong> 👋
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Te damos la bienvenida a <strong style="color:#111827;">Hungry Ape</strong>. Tu cuenta fue creada exitosamente con el <strong>Plan ${planName}</strong>.
                A partir de ahora podés recibir pedidos digitales, gestionar tu cocina y crecer sin complicaciones.
              </p>

              ${trialBanner}

              <!-- Plan benefits -->
              <div style="background:#f3f4f6;border-radius:16px;padding:24px 28px;margin-bottom:28px;">
                <p style="margin:0 0 14px;font-size:14px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:1px;">
                  Plan ${planName} — Lo que tenés incluido:
                </p>
                <ul style="margin:0;padding:0 0 0 4px;list-style:none;">
                  ${benefitItems}
                </ul>
              </div>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:16px;text-decoration:none;padding:16px 40px;border-radius:14px;letter-spacing:0.3px;">
                      Ir a mi Dashboard →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.5;">
                Si tenés alguna duda, respondé este correo o escríbenos a<br/>
                <a href="mailto:hola@teolabs.app" style="color:#dc2626;text-decoration:none;">hola@teolabs.app</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f3f4f6;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © 2026 Hungry Ape Fast Food App — Desarrollado por
                <a href="https://teolabs.app" style="color:#9ca3af;">Teo Labs</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface WelcomeEmailParams {
  to: string;
  businessName: string;
  planId: PlanId;
  dashboardUrl?: string;
}

export async function sendWelcomeEmail({
  to,
  businessName,
  planId,
  dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://hungryape.cl'}/dashboard`,
}: WelcomeEmailParams): Promise<void> {
  const transporter = createTransporter();

  const planName = PLAN_NAMES[planId] ?? 'Gratis';

  await transporter.sendMail({
    from: `"Hungry Ape 🦍" <${process.env.ZOHO_SMTP_USER}>`,
    to,
    subject: `¡Bienvenido a Hungry Ape, ${businessName}! Tu food truck digital está listo 🍌`,
    html: buildWelcomeHtml(businessName, planId, dashboardUrl),
    text: `¡Bienvenido a Hungry Ape!\n\nHola ${businessName},\n\nTu cuenta fue creada exitosamente con el Plan ${planName}.\n\nIngresa a tu dashboard: ${dashboardUrl}\n\n¿Dudas? Escríbenos a hola@teolabs.app\n\n© 2026 Hungry Ape`,
  });

  console.log(`✅ Welcome email sent to ${to} (plan: ${planId})`);
}

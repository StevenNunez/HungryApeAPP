import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Términos de Servicio — Hungry Ape',
  description: 'Términos y condiciones del servicio Hungry Ape, plataforma digital para food trucks en Chile.',
};

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center px-6 gap-4">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Inicio
          </Link>
          <div className="h-4 w-px bg-border" />
          <Link href="/" className="flex items-baseline select-none">
            <div className="relative flex items-baseline">
              <span aria-hidden="true" className="absolute inset-0 -inset-x-3 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] bg-accent/90 -z-0" style={{ transform: 'rotate(-1.5deg) skewX(-2deg)' }} />
              <span className="relative z-10 font-brand text-lg tracking-wider">HUNGRY</span>
              <span className="relative z-10 text-base mx-0.5" style={{ lineHeight: 1 }}>🍌</span>
              <span className="relative z-10 font-brand text-lg tracking-wider">APE</span>
            </div>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12 max-w-3xl">
        <div className="mb-10">
          <h1 className="font-brand text-4xl sm:text-5xl tracking-wide mb-3">TÉRMINOS DE SERVICIO</h1>
          <p className="text-sm text-muted-foreground">Última actualización: mayo de 2026 · Versión 1.0</p>
        </div>

        <div className="space-y-10 text-[15px] leading-relaxed">

          <section>
            <p>
              Los presentes Términos de Servicio (&quot;Términos&quot;) regulan el acceso y uso de la plataforma <strong>Hungry Ape</strong> (&quot;el Servicio&quot;), operada por <strong>Hungry Ape SpA</strong> (&quot;Hungry Ape&quot;, &quot;nosotros&quot; o &quot;la Empresa&quot;), sociedad constituida bajo las leyes de la República de Chile. Al registrarse o utilizar el Servicio, usted acepta íntegramente estos Términos. Si no está de acuerdo, no utilice el Servicio.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">1. Descripción del Servicio</h2>
            <p>
              Hungry Ape es una plataforma de software como servicio (SaaS) que permite a operadores de food trucks, cocinas y restaurantes gestionar un menú digital, recibir pedidos en tiempo real mediante código QR, administrar inventario y procesar pagos. El Servicio se presta a través de internet y requiere conexión activa para su funcionamiento.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">2. Registro y Cuenta</h2>
            <p className="mb-2">
              Para acceder al Servicio, el usuario debe crear una cuenta proporcionando información verídica y actualizada. El usuario es responsable de mantener la confidencialidad de sus credenciales y de todas las acciones realizadas bajo su cuenta.
            </p>
            <p>
              Solo pueden registrarse personas naturales mayores de 18 años o personas jurídicas legalmente constituidas en Chile o en el extranjero. Hungry Ape se reserva el derecho de suspender cuentas que proporcionen información falsa.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">3. Planes y Precios</h2>
            <p className="mb-2">
              El Servicio se ofrece en los siguientes planes:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
              <li><strong className="text-foreground">Básico</strong> — suscripción mensual o anual, menú digital, QR y cocina en tiempo real.</li>
              <li><strong className="text-foreground">Starter</strong> — suscripción mensual o anual, funcionalidades de inventario y analíticas básicas.</li>
              <li><strong className="text-foreground">Pro</strong> — suscripción mensual o anual, incluye pagos online, WhatsApp y reportes avanzados.</li>
              <li><strong className="text-foreground">Enterprise</strong> — suscripción mensual o anual, incluye multi-sucursales y control de insumos y costos.</li>
            </ul>
            <p className="mt-3">
              Los precios están expresados en Pesos Chilenos (CLP) e incluyen el IVA correspondiente cuando aplique. Hungry Ape se reserva el derecho de modificar los precios con 30 días de aviso previo. Las suscripciones en curso se mantienen al precio contratado hasta su renovación.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">4. Pagos y Facturación</h2>
            <p className="mb-2">
              Los pagos se procesan a través de <strong>Mercado Pago Chile S.A.</strong>, plataforma de pagos regulada en Chile. Al contratar un plan de pago, usted autoriza el cobro recurrente según la periodicidad elegida (mensual o anual).
            </p>
            <p>
              En caso de fallo en el cobro, el Servicio puede ser suspendido hasta que el pago sea regularizado. Hungry Ape no almacena datos de tarjetas de crédito; estos son gestionados exclusivamente por Mercado Pago conforme a estándares PCI-DSS.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">5. Derecho a Retracto</h2>
            <p className="mb-2">
              De conformidad con el <strong>artículo 3 bis de la Ley N.° 19.496</strong> sobre Protección de los Derechos de los Consumidores, y sus modificaciones vigentes, usted tiene derecho a retractarse de la contratación de un plan de pago dentro de los <strong>10 días hábiles</strong> siguientes a la fecha de pago, siempre que no haya hecho uso del Servicio durante ese período.
            </p>
            <p>
              Para ejercer el retracto, envíe un correo a <strong>soporte@hungryape.com</strong> indicando el número de pedido y su solicitud. El reembolso se realizará por el mismo medio de pago utilizado en un plazo máximo de 10 días hábiles desde la aceptación del retracto.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">6. Uso Aceptable</h2>
            <p className="mb-2">El usuario se compromete a no:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
              <li>Usar el Servicio para actividades ilegales o contrarias a la normativa chilena vigente.</li>
              <li>Suplantar la identidad de terceros o proporcionar información fraudulenta.</li>
              <li>Intentar acceder de forma no autorizada a sistemas, cuentas o datos de otros usuarios.</li>
              <li>Usar el Servicio para distribuir spam, malware u otro contenido malicioso.</li>
              <li>Revender o sublicenciar el acceso al Servicio sin autorización expresa de Hungry Ape.</li>
            </ul>
            <p className="mt-3">
              El incumplimiento de estas condiciones faculta a Hungry Ape para suspender o cancelar la cuenta de forma inmediata, sin perjuicio de las acciones legales que correspondan.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">7. Propiedad Intelectual</h2>
            <p>
              Todos los derechos de propiedad intelectual sobre el Servicio, incluyendo el código fuente, diseño, marca HUNGRY APE y logotipos, pertenecen a Hungry Ape SpA y se encuentran protegidos por la <strong>Ley N.° 17.336</strong> sobre Propiedad Intelectual. El usuario no adquiere ningún derecho de propiedad sobre el Servicio; solo se le otorga una licencia de uso limitada, no exclusiva e intransferible durante la vigencia de su suscripción.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">8. Datos de los Clientes Finales</h2>
            <p>
              Los datos de los clientes finales del usuario (nombre, pedidos, preferencias) son gestionados por el usuario en su calidad de responsable del tratamiento. Hungry Ape actúa como encargado del tratamiento en los términos del artículo 16 de la <strong>Ley N.° 21.719</strong>. El usuario es responsable de obtener los consentimientos necesarios de sus clientes y de cumplir con la normativa de protección de datos personales aplicable.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">9. Disponibilidad y Nivel de Servicio</h2>
            <p>
              Hungry Ape realiza esfuerzos razonables para mantener el Servicio disponible de forma continua. Sin embargo, no garantiza una disponibilidad del 100%. Podrán existir interrupciones planificadas (mantenimiento) o no planificadas (fallos técnicos, fuerza mayor). Hungry Ape notificará las interrupciones planificadas con al menos 24 horas de anticipación.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">10. Limitación de Responsabilidad</h2>
            <p className="mb-2">
              En la máxima medida permitida por la ley chilena, Hungry Ape no será responsable por:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
              <li>Pérdidas de ingresos, ganancias o datos derivadas del uso o imposibilidad de uso del Servicio.</li>
              <li>Daños causados por terceros proveedores (Mercado Pago, Supabase, proveedores de telecomunicaciones).</li>
              <li>Interrupciones causadas por fuerza mayor, incluyendo desastres naturales, actos de autoridad o fallas de internet.</li>
            </ul>
            <p className="mt-3">
              La responsabilidad total de Hungry Ape ante el usuario, bajo cualquier circunstancia, no superará el monto pagado por el usuario en los últimos 3 meses de servicio.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">11. Modificaciones a los Términos</h2>
            <p>
              Hungry Ape podrá modificar estos Términos en cualquier momento. Los cambios serán notificados al correo registrado con al menos 15 días de anticipación. El uso continuado del Servicio tras esa fecha constituye aceptación de los nuevos Términos.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">12. Terminación</h2>
            <p>
              El usuario puede cancelar su suscripción en cualquier momento desde el dashboard. El acceso al plan de pago continuará hasta el final del período ya abonado. Hungry Ape podrá cancelar la cuenta de un usuario que incumpla estos Términos, previa notificación cuando sea razonablemente posible.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">13. Legislación Aplicable y Jurisdicción</h2>
            <p>
              Estos Términos se rigen por las leyes de la <strong>República de Chile</strong>, en particular la <strong>Ley N.° 19.496</strong> (Protección al Consumidor) y el <strong>Código Civil</strong>. Cualquier controversia será sometida a la jurisdicción de los Tribunales Ordinarios de Justicia de la ciudad de <strong>Santiago de Chile</strong>, renunciando las partes a cualquier otro fuero o jurisdicción que pudiera corresponderles.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">14. Contacto</h2>
            <p>
              Para consultas sobre estos Términos, contáctenos en:{' '}
              <a href="mailto:legal@hungryape.com" className="text-primary hover:underline">legal@hungryape.com</a>
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-border py-8 mt-12">
        <div className="container mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">© 2026 Hungry Ape SpA — Todos los derechos reservados.</p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <Link href="/terminos" className="hover:text-foreground transition-colors font-medium text-foreground">Términos</Link>
            <Link href="/privacidad" className="hover:text-foreground transition-colors">Privacidad</Link>
            <Link href="/soporte" className="hover:text-foreground transition-colors">Soporte</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidad — Hungry Ape',
  description: 'Política de privacidad y tratamiento de datos personales de Hungry Ape, conforme a la Ley N.° 21.719 de Chile.',
};

export default function PrivacidadPage() {
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
          <h1 className="font-brand text-4xl sm:text-5xl tracking-wide mb-3">POLÍTICA DE PRIVACIDAD</h1>
          <p className="text-sm text-muted-foreground">Última actualización: mayo de 2026 · Versión 1.0</p>
          <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-2xl text-sm text-muted-foreground">
            Esta política está redactada conforme a la <strong className="text-foreground">Ley N.° 21.719</strong> de Protección de Datos Personales de Chile (publicada el 13 de diciembre de 2024 y en período de transición) y complementariamente a la <strong className="text-foreground">Ley N.° 19.628</strong> vigente durante dicho período.
          </div>
        </div>

        <div className="space-y-10 text-[15px] leading-relaxed">

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">1. Responsable del Tratamiento</h2>
            <p>
              El responsable del tratamiento de los datos personales es <strong>Hungry Ape SpA</strong>, sociedad por acciones constituida bajo las leyes de la República de Chile, con domicilio en Chile. Para consultas o ejercicio de derechos, contactar a: <a href="mailto:privacidad@hungryape.com" className="text-primary hover:underline">privacidad@hungryape.com</a>
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">2. Datos Personales que Recopilamos</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-1">Datos que usted nos entrega directamente</h3>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                  <li>Nombre y apellido o razón social del negocio</li>
                  <li>Correo electrónico</li>
                  <li>RUT (opcional, para emisión de documentos tributarios)</li>
                  <li>Información de configuración de su menú (productos, categorías, precios)</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-1">Datos generados por el uso del Servicio</h3>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                  <li>Historial de pedidos recibidos (no datos personales de sus clientes finales)</li>
                  <li>Estadísticas de uso, ventas y métricas del dashboard</li>
                  <li>Registros de acceso (IP, tipo de dispositivo, navegador)</li>
                  <li>Fecha y hora de acciones relevantes en la plataforma</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-1">Datos de pago</h3>
                <p className="text-muted-foreground">
                  Los datos de tarjetas de crédito/débito son procesados exclusivamente por <strong className="text-foreground">Mercado Pago Chile S.A.</strong> Hungry Ape no almacena datos de instrumentos de pago; solo recibe la confirmación de éxito o fallo del cobro.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">3. Finalidades del Tratamiento</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-2">
              <li><strong className="text-foreground">Prestación del Servicio:</strong> gestionar su cuenta, menú, pedidos, inventario y pagos.</li>
              <li><strong className="text-foreground">Facturación:</strong> emitir cobros periódicos según el plan contratado.</li>
              <li><strong className="text-foreground">Comunicaciones del Servicio:</strong> notificaciones sobre su cuenta, cambios en el Servicio o alertas operacionales.</li>
              <li><strong className="text-foreground">Mejora del Servicio:</strong> análisis agregado y anónimo del uso para detectar errores y priorizar funcionalidades.</li>
              <li><strong className="text-foreground">Cumplimiento legal:</strong> atender obligaciones fiscales, judiciales o de reguladores chilenos.</li>
            </ul>
            <p className="mt-3">
              No utilizamos sus datos personales para publicidad de terceros ni los vendemos a ningún actor externo.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">4. Base Jurídica del Tratamiento</h2>
            <p className="mb-2">
              Conforme al artículo 13 de la <strong>Ley N.° 21.719</strong>, el tratamiento de sus datos se fundamenta en:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
              <li><strong className="text-foreground">Ejecución de un contrato:</strong> datos necesarios para prestar el Servicio contratado (art. 13 letra b).</li>
              <li><strong className="text-foreground">Obligación legal:</strong> datos requeridos por normativa tributaria o judicial chilena (art. 13 letra c).</li>
              <li><strong className="text-foreground">Interés legítimo:</strong> mejora del Servicio, detección de fraudes y seguridad de la plataforma (art. 13 letra f).</li>
              <li><strong className="text-foreground">Consentimiento:</strong> comunicaciones de marketing (puede retirarlo en cualquier momento).</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">5. Transferencias Internacionales de Datos</h2>
            <p className="mb-3">
              El Servicio utiliza proveedores de infraestructura ubicados fuera de Chile. De conformidad con el artículo 28 de la <strong>Ley N.° 21.719</strong>, las transferencias internacionales se realizan garantizando un nivel adecuado de protección:
            </p>
            <div className="space-y-3">
              <div className="border border-border rounded-xl p-4">
                <p className="font-medium mb-1">Supabase Inc. — Estados Unidos</p>
                <p className="text-sm text-muted-foreground">Proveedor de base de datos y autenticación. Los datos se almacenan en servidores en la región US East. Supabase actúa como encargado del tratamiento bajo un Acuerdo de Procesamiento de Datos (DPA) con cláusulas contractuales tipo.</p>
              </div>
              <div className="border border-border rounded-xl p-4">
                <p className="font-medium mb-1">Mercado Pago Chile S.A. — Chile / Argentina</p>
                <p className="text-sm text-muted-foreground">Procesador de pagos. Trata datos de pago bajo su propia política de privacidad y regulación del Banco Central de Chile. Actúa como responsable independiente para los datos de transacciones financieras.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">6. Tiempo de Retención</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-2">
              <li><strong className="text-foreground">Datos de cuenta activa:</strong> durante toda la vigencia de la relación contractual.</li>
              <li><strong className="text-foreground">Tras cancelación de cuenta:</strong> los datos se anonomizan o eliminan en un plazo máximo de 90 días, salvo obligación legal de conservación.</li>
              <li><strong className="text-foreground">Datos tributarios y de facturación:</strong> 6 años conforme al artículo 200 del Código Tributario chileno.</li>
              <li><strong className="text-foreground">Registros de seguridad (logs):</strong> 12 meses.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">7. Sus Derechos</h2>
            <p className="mb-3">
              Conforme a los artículos 14 al 20 de la <strong>Ley N.° 21.719</strong>, usted tiene los siguientes derechos respecto de sus datos personales:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { right: 'Acceso', desc: 'Conocer qué datos tenemos y cómo los tratamos.' },
                { right: 'Rectificación', desc: 'Corregir datos inexactos o incompletos.' },
                { right: 'Supresión', desc: 'Solicitar la eliminación de sus datos cuando no sean necesarios.' },
                { right: 'Oposición', desc: 'Oponerse al tratamiento basado en interés legítimo.' },
                { right: 'Portabilidad', desc: 'Recibir sus datos en formato estructurado y legible por máquina.' },
                { right: 'Limitación', desc: 'Solicitar que se restrinja el tratamiento en ciertos supuestos.' },
              ].map(({ right, desc }) => (
                <div key={right} className="border border-border rounded-xl p-3">
                  <p className="font-medium text-sm mb-0.5">{right}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-4">
              Para ejercer cualquiera de estos derechos, envíe su solicitud a <a href="mailto:privacidad@hungryape.com" className="text-primary hover:underline">privacidad@hungryape.com</a> indicando su nombre, correo registrado y el derecho que desea ejercer. Responderemos dentro de los <strong>15 días hábiles</strong> establecidos por la Ley N.° 21.719.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">8. Seguridad</h2>
            <p>
              Implementamos medidas técnicas y organizativas adecuadas para proteger sus datos personales, incluyendo cifrado en tránsito (TLS 1.3) y en reposo, control de acceso basado en roles, autenticación segura y auditorías de seguridad periódicas. En caso de una brecha de seguridad que afecte sus datos, le notificaremos en los plazos establecidos por la normativa vigente.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">9. Cookies y Tecnologías de Seguimiento</h2>
            <p>
              Hungry Ape utiliza cookies técnicas estrictamente necesarias para el funcionamiento del Servicio (sesión de autenticación). No utilizamos cookies de seguimiento publicitario ni compartimos datos de navegación con redes de publicidad. Las cookies técnicas no requieren consentimiento previo conforme a la normativa chilena vigente.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">10. Menores de Edad</h2>
            <p>
              El Servicio está destinado a operadores de negocios. No recopilamos conscientemente datos de menores de 14 años. Si usted cree que hemos tratado datos de un menor sin el consentimiento parental requerido, contáctenos para proceder a su eliminación inmediata.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">11. Autoridad de Control</h2>
            <p>
              Si considera que el tratamiento de sus datos infringe la normativa de protección de datos, puede presentar una reclamación ante la <strong>Agencia de Protección de Datos Personales</strong> de Chile, creada por la Ley N.° 21.719. Mientras la Agencia se encuentra en proceso de implementación, las reclamaciones pueden dirigirse al <strong>Consejo para la Transparencia</strong> o a los tribunales competentes.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">12. Cambios a esta Política</h2>
            <p>
              Podremos actualizar esta Política para reflejar cambios en el Servicio, en la ley o en nuestras prácticas. Notificaremos cambios significativos por correo electrónico con al menos 15 días de anticipación. La versión vigente siempre estará disponible en <Link href="/privacidad" className="text-primary hover:underline">hungryape.com/privacidad</Link>.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-xl mb-3 text-foreground">13. Contacto</h2>
            <p>
              Para cualquier consulta sobre esta Política o el ejercicio de sus derechos:<br />
              <a href="mailto:privacidad@hungryape.com" className="text-primary hover:underline">privacidad@hungryape.com</a>
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-border py-8 mt-12">
        <div className="container mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">© 2026 Hungry Ape SpA — Todos los derechos reservados.</p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <Link href="/terminos" className="hover:text-foreground transition-colors">Términos</Link>
            <Link href="/privacidad" className="hover:text-foreground transition-colors font-medium text-foreground">Privacidad</Link>
            <Link href="/soporte" className="hover:text-foreground transition-colors">Soporte</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

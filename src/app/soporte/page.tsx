import Link from 'next/link';
import { ArrowLeft, Mail, Clock, MessageSquare, ChevronDown } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Soporte — Hungry Ape',
  description: 'Centro de soporte Hungry Ape. Encuentra respuestas a preguntas frecuentes o contáctanos.',
};

const faqs = [
  {
    q: '¿Cómo genero el código QR de mi negocio?',
    a: 'Una vez creada tu cuenta y configurado tu menú, ve a Dashboard → Código QR. Ahí encontrarás tu QR único para imprimir o descargar en alta resolución.',
  },
  {
    q: '¿El cliente necesita instalar alguna app para pedir?',
    a: 'No. El cliente escanea el QR y accede al menú desde el navegador de su teléfono, sin instalar nada. Hungry Ape es una PWA (Progressive Web App) que funciona en todos los dispositivos.',
  },
  {
    q: '¿Cómo funciona el código de retiro seguro?',
    a: 'Al confirmar su pedido, el cliente recibe un código único de 4 dígitos. Tu cocina lo solicita al momento de la entrega para verificar que quien retira es quien pagó.',
  },
  {
    q: '¿Puedo cambiar de plan en cualquier momento?',
    a: 'Sí. Puedes subir de plan en cualquier momento y el cambio será efectivo de inmediato. El crédito del período no consumido se descuenta del nuevo cobro.',
  },
  {
    q: '¿Qué pasa con mis datos si cancelo mi cuenta?',
    a: 'Tu acceso al plan de pago continúa hasta el fin del período ya abonado. Tras la cancelación definitiva, tus datos se anonomizan en un plazo máximo de 90 días conforme a nuestra Política de Privacidad.',
  },
  {
    q: '¿Cómo funciona el inventario en tiempo real?',
    a: 'Cada vez que se acepta un pedido, el stock de los productos involucrados se descuenta automáticamente. Recibirás alertas cuando un producto alcance stock bajo (5 unidades) o se agote. Los productos sin stock dejan de aparecer en el menú del cliente.',
  },
  {
    q: '¿Los pedidos llegan si no tengo internet?',
    a: 'El Servicio requiere conexión a internet para recibir pedidos en tiempo real. Si pierdes conexión momentáneamente, los pedidos se sincronizan automáticamente al reconectarte.',
  },
  {
    q: '¿Cómo proceso pagos online con el plan Pro?',
    a: 'Con el plan Pro, los clientes pueden pagar con tarjeta de crédito/débito y apps de pago a través de Mercado Pago. Debes conectar tu cuenta de Mercado Pago desde Dashboard → Configuración → Métodos de Pago.',
  },
  {
    q: '¿Hungry Ape cobra comisión por cada pedido?',
    a: 'No. Hungry Ape cobra solo la suscripción mensual o anual del plan elegido. No hay comisiones por pedido, independiente del volumen de ventas.',
  },
  {
    q: '¿Puedo tener múltiples menús o locales?',
    a: 'El plan Enterprise incluye soporte multi-sucursales. Con los planes Básico, Starter y Pro, cada cuenta corresponde a un local.',
  },
];

const slaByPlan = [
  { plan: 'Básico', color: 'bg-teal-500/10', time: 'Hasta 5 días hábiles', channel: 'Email' },
  { plan: 'Starter', color: 'bg-blue-500/10 border-blue-500/20', time: 'Hasta 48 horas hábiles', channel: 'Email' },
  { plan: 'Pro', color: 'bg-primary/10 border-primary/20', time: 'Hasta 24 horas hábiles', channel: 'Email prioritario' },
  { plan: 'Enterprise', color: 'bg-amber-500/10 border-amber-500/20', time: 'Hasta 4 horas hábiles', channel: 'Email + canal dedicado' },
];

export default function SoportePage() {
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
        <div className="mb-10 text-center">
          <h1 className="font-brand text-4xl sm:text-5xl tracking-wide mb-3">SOPORTE</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Estamos aquí para ayudarte. Encuentra respuestas rápidas abajo o escríbenos directamente.
          </p>
        </div>

        {/* Contact card */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-12 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Escríbenos por email</p>
              <p className="text-sm text-muted-foreground mt-0.5">La forma más rápida de resolver tu consulta.</p>
              <a href="mailto:soporte@hungryape.com" className="text-primary text-sm font-medium hover:underline mt-1 inline-block">
                soporte@hungryape.com
              </a>
            </div>
          </div>
          <a
            href="mailto:soporte@hungryape.com"
            className="shrink-0 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all active:scale-95"
          >
            Enviar mensaje
          </a>
        </div>

        {/* SLA by plan */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Tiempos de respuesta por plan</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {slaByPlan.map(({ plan, color, time, channel }) => (
              <div key={plan} className={`border rounded-xl p-4 ${color}`}>
                <p className="font-bold text-sm mb-1">{plan}</p>
                <p className="text-sm text-muted-foreground">{time}</p>
                <p className="text-xs text-muted-foreground mt-1">Canal: {channel}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Horario de atención: lunes a viernes, 9:00–18:00 hrs (hora de Chile). Los tiempos se cuentan en horas hábiles.
          </p>
        </section>

        {/* FAQ */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Preguntas Frecuentes</h2>
          </div>
          <div className="space-y-3">
            {faqs.map(({ q, a }, i) => (
              <details key={i} className="group border border-border rounded-xl overflow-hidden">
                <summary className="flex items-center justify-between p-4 cursor-pointer list-none hover:bg-muted/50 transition-colors">
                  <span className="font-medium text-sm pr-4">{q}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-4 pb-4 pt-1 text-sm text-muted-foreground leading-relaxed border-t border-border">
                  {a}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Legal links */}
        <div className="mt-12 pt-8 border-t border-border flex flex-wrap gap-6 text-sm text-muted-foreground">
          <p>¿Tienes consultas legales o sobre privacidad?</p>
          <div className="flex gap-4">
            <Link href="/terminos" className="text-primary hover:underline">Términos de Servicio</Link>
            <Link href="/privacidad" className="text-primary hover:underline">Política de Privacidad</Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-8 mt-12">
        <div className="container mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">© 2026 Hungry Ape SpA — Todos los derechos reservados.</p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <Link href="/terminos" className="hover:text-foreground transition-colors">Términos</Link>
            <Link href="/privacidad" className="hover:text-foreground transition-colors">Privacidad</Link>
            <Link href="/soporte" className="hover:text-foreground transition-colors font-medium text-foreground">Soporte</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

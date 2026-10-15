<div align="center">

# HUNGRY APE 🦍🍌

**El menú digital y la cocina en tiempo real para food trucks.**

Tus clientes escanean un QR, piden desde el celular y tú ves cada pedido caer en la cocina al instante.

Un producto de **[Teo Labs](https://www.teolabs.app)** ®

</div>

---

## De qué se trata

Un food truck vive de la velocidad y del orden. En hora punta la fila se alarga, el cliente no sabe qué hay, el pedido se anota en un papel, alguien pregunta "¿ya está el mío?" y al cerrar nadie sabe cuánta plata debería haber en la caja.

Hungry Ape responde a las preguntas que se hace el dueño todos los días:

- ¿Cómo evito que mis clientes hagan fila solo para ver el menú?
- ¿Cómo sé qué pedir primero, y que la cocina no se pierda "sin palta, bien cocido, con mayonesa"?
- ¿Cómo aviso que el pedido está listo sin gritar nombres?
- ¿Cuánto vendí hoy, por qué método de pago, y cuadra la caja?
- ¿Qué producto se me está acabando?

Cada local tiene su propia dirección (`/m/mi-food-truck`), su menú, su cocina, su caja y sus datos, completamente separados de los demás locales.

---

## Lo que hace

### Para el cliente (sin cuenta, sin app)

| Función | Cómo funciona |
|---|---|
| **Menú por QR** | Se abre en el celular, con categorías, fotos, precios y stock en vivo: si algo se agota, desaparece del menú sin recargar. |
| **Pedidos a medida** | Salsas, extras con costo, quitar ingredientes, punto de cocción. Los grupos pueden ser obligatorios (elige uno) o múltiples. |
| **Apodo y código de retiro** | El cliente se identifica con un apodo (puede pedir una sugerencia con IA) y recibe un código de 4 caracteres para retirar. |
| **Aquí o para llevar** | Cada pedido indica cómo se entrega. |
| **Seguimiento en vivo** | Una pantalla con el estado: *Por Pagar → Pendiente → En preparación → Listo → Entregado*, con aviso cuando está listo. |
| **Pago** | Efectivo o transferencia (con los datos bancarios del local solo para quien eligió transferir), tarjeta en caja, y **pago online con Mercado Pago** en el plan Pro. |
| **Aviso de "pedido listo"** *(Pro)* | Una notificación en su celular y/o un mensaje de WhatsApp apenas cocina marca el pedido como listo. Sin descargar nada. |

### Para el dueño (panel `/dashboard`)

| Módulo | Qué resuelve |
|---|---|
| **Cocina** | Pedidos en tiempo real con cada personalización. Se confirma el pago, se pasa a preparación, a listo y a entregado. |
| **Menú** | Productos, categorías, fotos (con compresión automática), stock, grupos de modificadores y archivado en vez de borrado. |
| **Caja** | Apertura con monto inicial, egresos con motivo, cierre con arqueo automático e historial de turnos. |
| **Inventario y reportes** | Stock con alertas de nivel bajo, ventas brutas, ventas por día (con rango: hoy, 7 y 30 días, todo) y por método de pago. |
| **Rentabilidad** *(Pro)* | Costo por producto, margen total y por producto, y cuántas de tus ventas ya tienen costo cargado. El costo queda "congelado" en cada venta: editarlo después no altera el margen histórico. |
| **Tiempos de preparación** *(Pro)* | Preparación promedio, espera del cliente desde que paga y promedio por producto. |
| **Reposición** *(Pro)* | Para cada producto con stock bajo: cuánto comprar hasta su stock objetivo y cuánto costaría. |
| **Exportar** *(Pro)* | Reportes en Excel y PDF, generados en el navegador. |
| **Pagos online** *(Pro)* | Cada local conecta su propia cuenta de Mercado Pago; el cliente paga ahí, el pedido pasa solo a cocina y el dinero llega directo al local. |
| **QR** | Genera y descarga el QR del local en PNG. |
| **Configuración** | Nombre, descripción, logo, WhatsApp, datos de transferencia y estado de la suscripción (con cancelación). |
| **Onboarding** | Un asistente crea el negocio y el primer producto en minutos. |

### Planes

Prueba gratuita de 14 días con funciones de Starter. Después: Básico, Starter, Pro y Enterprise, mensual o anual (con descuento). Los precios viven en un solo archivo (`src/lib/plans.ts`) y alimentan tanto la web como el cobro. Las funciones Pro se activan solas según el plan del local.

---

## Un pedido, de punta a punta

```
  CLIENTE (celular)                    SERVIDOR                         DUEÑO (cocina)
  ─────────────────                    ────────                         ──────────────
  Escanea el QR  ───────────────►  /m/mi-truck  (menú ya renderizado)
  Elige productos y extras
  Pone un apodo, elige pago ────►  create_order()  ─ valida stock y opciones
                                    │               ─ toma precios de la BD
                                    │               ─ calcula el total
                                    │               ─ aplica límites del plan
                                    ▼               ─ todo en UNA transacción
                              Pedido #12 "Por Pagar" ─────────────────► 🔔 aparece en cocina
  Ve su código y el estado  ◄───  get_order_public()                      Confirma el pago
        ▲                                                                 Prepara → Listo
        └──────────── "¡Tu pedido está listo!" ◄──────────────────────── Entrega con el código
                                                                          └─► Caja y reportes
```

---

## Las decisiones que sostienen el sistema

1. **El precio lo decide el servidor, nunca el celular del cliente.** El cliente solo envía *qué* eligió. El total, las reglas de las opciones y el stock se calculan dentro de la base de datos, en una sola transacción: no existen pedidos a medias ni totales alterados.
2. **Cada local ve solo lo suyo.** Seguridad a nivel de fila en la base de datos: ni los pedidos ni los datos bancarios ni el estado de suscripción de un local son legibles por otros. El menú público lee una vista con datos de vitrina únicamente.
3. **Nadie se asigna un plan a mano.** Los campos de facturación solo los cambia el sistema de cobros; un dueño no puede ponerse el plan Pro desde su navegador.
4. **Un pago nunca se pierde.** Si un cliente paga antes de crear su cuenta, el pago queda en espera y se aplica al verificar su correo. El plan anual vence a los 12 meses; la renovación mensual se sincroniza con Mercado Pago cada hora.
5. **El cliente no necesita nada.** Sin registro ni app: un QR, un apodo y un código de retiro.
6. **Las funciones que cobran por uso no nos cuestan por uso.** El aviso por WhatsApp solo responde dentro de la conversación que abre el cliente (sin mensajes de plantilla, que Meta cobra uno a uno); la notificación push, los reportes y las exportaciones no tienen costo por envío; en los pagos online la comisión la paga el local a Mercado Pago, y el dinero nunca pasa por nosotros.

---

## Stack

| Capa | Tecnología |
|---|---|
| App | Next.js 15 (App Router), React 18, TypeScript |
| Interfaz | Tailwind CSS, shadcn/ui, Framer Motion, Recharts |
| Datos y auth | Supabase (Postgres, Auth, Storage, Realtime) |
| Cobros | Mercado Pago (suscripciones de la plataforma y pagos online de cada local, vía Marketplace) |
| Avisos | Web Push (VAPID) y WhatsApp Business Cloud API |
| Reportes | jsPDF y write-excel-file, cargados solo al exportar |
| Correos | Nodemailer sobre Zoho SMTP |
| IA | Genkit + Google AI (sugerencia de apodos) |
| Pruebas | Vitest |
| Hosting | Vercel (con crons) |

---

## Puesta en marcha

```bash
npm install
cp .env.example .env.local     # completa las variables
npm run dev                    # http://localhost:3000
```

**Base de datos:** ejecuta en el SQL Editor de Supabase, en orden, los archivos de `supabase/migrations/` (001 a la última). Opcionalmente `supabase/seeds/demo-products.sql` para cargar el local de demostración.

**Variables de entorno** (detalle en `.env.example`): Supabase (URL, clave pública y clave de servicio), `NEXT_PUBLIC_APP_URL`, Mercado Pago (token, clave pública y secreto del webhook), SMTP de Zoho, clave de Google AI y `CRON_SECRET`. Las funciones Pro suman, y cada una se activa solo cuando sus variables existen: llaves VAPID (avisos push), credenciales de WhatsApp Cloud API (avisos por WhatsApp) y `MP_CLIENT_ID` / `MP_CLIENT_SECRET` / `PAYMENTS_ENC_KEY` (pagos online).

**Scripts**

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción (falla ante errores de tipos) |
| `npm run typecheck` | Revisión de tipos |
| `npm test` | Pruebas del flujo de cobros y la seguridad |

---

## Estructura

```
src/
├── app/
│   ├── page.tsx                 Landing y planes
│   ├── demo/                    Demo interactiva (cliente + cocina)
│   ├── m/[tenantSlug]/          Menú público y seguimiento del pedido
│   ├── dashboard/               Cocina, caja, menú, QR, reportes, configuración
│   ├── login/ · auth/           Acceso y confirmación de correo
│   └── api/
│       ├── mercadopago/         Crear cobro, webhook, sincronización manual
│       ├── billing/             Aplicar pagos hechos antes de registrarse
│       ├── payments/            Conexión OAuth de la cuenta de Mercado Pago de cada local
│       ├── orders/[id]/         Cambio de estado (con avisos) y pago online del pedido
│       ├── push/ · whatsapp/    Avisos de "pedido listo"
│       ├── subscription/        Cancelación
│       ├── cron/                Sincronización de suscripciones y recordatorios
│       └── email/ · demo/       Bienvenida y reinicio de la demo
├── components/                  carrito · cocina · menu · pedido · inicio · compartido · ui
├── lib/                         data (consultas), billing, plans, email, supabase/
├── hooks/ · context/            Tenant del usuario y carrito
└── ai/flows/                    Sugerencia de apodos
supabase/migrations/             Esquema, políticas de seguridad y funciones SQL
tests/                           Pruebas automáticas
```

---

## Deploy

Pensado para **Vercel**. Los crons se definen en `vercel.json`:

- `check-subscriptions` — cada hora: sincroniza suscripciones y da de baja los planes anuales vencidos.
- `subscription-reminders` — diario: avisa por correo cuando la prueba está por terminar.
- `purge` — diario: borra suscripciones push y vínculos de WhatsApp de más de 2 días (datos personales de corta vida).

Ambos exigen `CRON_SECRET`: si la variable no existe, se niegan a ejecutar. En Mercado Pago, apunta las notificaciones de suscripciones a `/api/mercadopago/webhook`, y registra como URL de redirección de la app de marketplace `<tu-dominio>/api/payments/connect/callback`. En Meta, el webhook de WhatsApp es `/api/whatsapp/webhook`.

---

## Seguridad

- Políticas RLS en todas las tablas; los pedidos solo se crean y se consultan a través de funciones controladas.
- Webhook de Mercado Pago con verificación de firma; cada pago se vuelve a consultar a Mercado Pago, nunca se confía en el cuerpo recibido.
- Endpoints sensibles con sesión obligatoria, límites de uso y cabeceras de seguridad.
- El optimizador de imágenes solo acepta los orígenes del propio proyecto.
- Los tokens de Mercado Pago de cada local se guardan cifrados (AES-256-GCM) y el flujo de conexión usa un `state` firmado y con vencimiento.
- Los endpoints de avisos aceptan únicamente servicios push reales (sin riesgo de SSRF), tienen límites por IP y los números de WhatsApp se borran apenas se envía el aviso.

---

<div align="center">

**Construido por [Teo Labs](https://www.teolabs.app) ®**

*Para los que cocinan sobre ruedas.*

</div>

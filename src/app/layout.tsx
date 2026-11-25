import type { Metadata, Viewport } from 'next';
import { Luckiest_Guy, Poppins, Lexend } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ape.teolabs.app';

// Self-hosted by next/font: no render-blocking request to Google, no layout shift.
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-poppins', display: 'swap' });
const luckiestGuy = Luckiest_Guy({ subsets: ['latin'], weight: '400', variable: '--font-luckiest', display: 'swap' });
const lexend = Lexend({ subsets: ['latin'], weight: '700', variable: '--font-lexend', display: 'swap' });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ef4444' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export const metadata: Metadata = {
  title: {
    default: 'Hungry Ape — Menú digital para Food Trucks',
    template: '%s | Hungry Ape',
  },
  description: 'La plataforma SaaS para Food Trucks. Menú digital con QR, pedidos en tiempo real, control de stock e inventario. Rápido, rico y salvaje.',
  metadataBase: new URL(APP_URL),
  keywords: [
    'food truck', 'menú digital', 'menú QR', 'pedidos online', 'software para food trucks',
    'carrito de comida', 'comida rápida', 'Chile',
  ],
  authors: [{ name: 'Teo Labs', url: 'https://www.teolabs.app' }],
  creator: 'Teo Labs',
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
    shortcut: '/favicon.ico',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Hungry Ape',
  },
  applicationName: 'Hungry Ape',
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    url: APP_URL,
    siteName: 'Hungry Ape',
    title: 'Hungry Ape — Menú digital para Food Trucks',
    description: 'La plataforma SaaS para Food Trucks. Menú digital con QR, pedidos en tiempo real, control de stock e inventario.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Hungry Ape — Menú digital para Food Trucks. Escanea el QR, pide y retira.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hungry Ape — Menú digital para Food Trucks',
    description: 'La plataforma SaaS para Food Trucks. Menú digital con QR, pedidos en tiempo real, control de stock.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${poppins.variable} ${luckiestGuy.variable} ${lexend.variable}`}>
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}

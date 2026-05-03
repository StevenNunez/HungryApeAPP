import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ape.teolabs.app';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0a0a0a' }],
};

export const metadata: Metadata = {
  title: {
    default: 'Hungry Ape — Menú digital para Food Trucks',
    template: '%s | Hungry Ape',
  },
  description: 'La plataforma SaaS para Food Trucks. Menú digital con QR, pedidos en tiempo real, control de stock e inventario. Rápido, rico y salvaje.',
  metadataBase: new URL(APP_URL),
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
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
        alt: 'Hungry Ape — Menú digital para Food Trucks',
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
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Luckiest Guy for brand logo, Poppins for body */}
        <link
          href="https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}

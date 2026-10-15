import type { MetadataRoute } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ape.teolabs.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/demo', '/terminos', '/privacidad', '/soporte'],
        // Panels, APIs and per-customer order pages are not for search engines
        disallow: ['/dashboard', '/api/', '/auth/', '/suscripcion/', '/m/*/pedido/'],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}

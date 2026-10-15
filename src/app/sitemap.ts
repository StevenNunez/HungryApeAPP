import type { MetadataRoute } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ape.teolabs.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${APP_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${APP_URL}/demo`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${APP_URL}/soporte`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${APP_URL}/terminos`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${APP_URL}/privacidad`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];
}

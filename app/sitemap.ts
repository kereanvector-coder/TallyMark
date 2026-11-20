import type { MetadataRoute } from 'next';
import { MARKETING_CONFIG } from '@/lib/marketing-config';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = MARKETING_CONFIG.siteUrl;
  const now = new Date();

  return [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${base}/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${base}/terms`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];
}

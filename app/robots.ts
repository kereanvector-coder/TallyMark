import type { MetadataRoute } from 'next';
import { MARKETING_CONFIG } from '@/lib/marketing-config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/privacy', '/terms'],
        disallow: ['/app/', '/api/', '/auth/'],
      },
    ],
    sitemap: `${MARKETING_CONFIG.siteUrl}/sitemap.xml`,
  };
}

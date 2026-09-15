import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config';

export default function robots(): MetadataRoute.Robots {
  return {
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/admin', '/onboarding', '/forgot', '/reset-password', '/paystack', '/payment'],
      },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

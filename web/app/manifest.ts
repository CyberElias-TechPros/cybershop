import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CyberShop — find a business, talk to it on WhatsApp',
    short_name: 'CyberShop',
    description: 'Catalogues from real Nigerian businesses. One tap opens WhatsApp — never a checkout.',
    id: '/',
    start_url: '/',
    display: 'standalone',
    background_color: '#060b09',
    theme_color: '#060b09',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

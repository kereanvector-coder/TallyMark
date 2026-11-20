import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Tallymark',
    short_name: 'Tallymark',
    description:
      'Issue professional receipts in seconds and keep a clean digital cash book for Nigerian small businesses.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FAF7F0',
    theme_color: '#0F5132',
    icons: [
      {
        src: '/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: 'LIFEOS — The Personal Operating System',
    short_name: 'LIFEOS',
    description: 'Everything in your life. One intelligent workspace.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'any',
    background_color: '#090a0e',
    theme_color: '#090a0e',
    categories: ['productivity', 'lifestyle', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Quick capture', short_name: 'Capture', url: '/app?capture=1', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Tasks', url: '/app/tasks', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Calendar', url: '/app/calendar', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Notes', url: '/app/notes', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}

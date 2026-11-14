import type { Metadata, Viewport } from 'next';
import './globals.css';
import { GlassFx } from '@/ui/GlassFx';

export const metadata: Metadata = {
  title: { default: 'LIFEOS — The Personal Operating System', template: '%s · LIFEOS' },
  description: 'Everything in your life. One intelligent workspace. Tasks, calendar, projects, notes, habits, money, health and more — offline-first, synced across your devices.',
  applicationName: 'LIFEOS',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'LIFEOS', statusBarStyle: 'black-translucent' },
  icons: { icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { url: '/icons/icon.svg', type: 'image/svg+xml' }], apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#090a0e' }, { media: '(prefers-color-scheme: light)', color: '#f3f4f8' }],
};

// Applies the saved theme before first paint so there is no flash of the wrong theme.
const themeScript = `try{var p=JSON.parse(localStorage.getItem('lifeos.look')||'{}');var t=p.theme||'dark';if(t==='system')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';var e=document.documentElement;e.dataset.theme=t;if(p.hue!=null)e.style.setProperty('--accent-h',p.hue);if(p.density)e.dataset.density=p.density;}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <GlassFx />
      </body>
    </html>
  );
}

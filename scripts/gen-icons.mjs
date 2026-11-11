// Renders the PWA icons from inline SVG with headless Chromium. Run: npm run icons
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const mark = (scale, bg, mono) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mono ? '#fff' : '#22d3ee'}"/><stop offset="0.55" stop-color="${mono ? '#fff' : '#60a5fa'}"/><stop offset="1" stop-color="${mono ? '#fff' : '#a78bfa'}"/></linearGradient></defs>
    ${bg}
    <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">
      <circle cx="32" cy="32" r="17" fill="none" stroke="url(#g)" stroke-width="4.5" stroke-dasharray="78 29" stroke-linecap="round" transform="rotate(-50 32 32)"/>
      <circle cx="32" cy="32" r="6.5" fill="url(#g)"/>
      <circle cx="47.5" cy="20" r="3.2" fill="${mono ? '#fff' : '#a78bfa'}"/>
    </g>
  </svg>`;
const rounded = '<rect width="64" height="64" rx="14" fill="#0d1017"/>';
const full = '<rect width="64" height="64" fill="#0d1017"/>';
const icons = [
  ['icon-192.png', 192, mark(1, rounded), true],
  ['icon-512.png', 512, mark(1, rounded), true],
  ['maskable-512.png', 512, mark(0.72, full), false], // content inside the maskable safe zone
  ['apple-touch-icon.png', 180, mark(0.9, full), false],
  ['badge-96.png', 96, mark(1.25, '', true), true],
];

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch();
for (const [name, size, svg, transparent] of icons) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: transparent });
  await page.close();
  console.log('wrote', name);
}
await browser.close();

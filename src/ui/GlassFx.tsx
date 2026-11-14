'use client';

import { useEffect } from 'react';

const SURFACES = '.glass, .glass-chrome, .widget, .card-hover, .panel';

/**
 * Liquid-glass specular sheen: a soft highlight that follows the pointer across glass surfaces
 * (sets --mx / --my on the hovered one). Decorative only; skipped on touch screens.
 */
export function GlassFx() {
  useEffect(() => {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      const e = last;
      if (!e || !(e.target instanceof Element)) return;
      const el = e.target.closest<HTMLElement>(SURFACES);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

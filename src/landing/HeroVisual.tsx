'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '@/ui/icons';
import { cx } from '@/ui/kit';
import type { MoonSpec, Tier } from './LifeCore';

const LifeCore = dynamic(() => import('./LifeCore'), { ssr: false });

export interface HeroModule { id: string; name: string; tagline: string; hue: number; icon: string }

function webgl2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** Match the scene's detail to the device: phones and low-memory machines get fewer particles and no transmission. */
function pickTier(): Tier {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const high = !coarse && memory >= 4 && cores >= 4;
  return high
    ? { high, dpr: [1, 1.75], disk: 26_000, stars: 3_600, detail: 72, octaves: 5 }
    : { high, dpr: [1, 1.5], disk: 10_000, stars: 1_600, detail: 30, octaves: 3 };
}

/** The module icons, as the app draws them, turned into SVG images for the 3D scene. */
function iconUrls(root: HTMLElement): string[] {
  return [...root.querySelectorAll('svg')].map((svg) => {
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('stroke', '#ffffff');
    clone.removeAttribute('class');
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clone.outerHTML.replaceAll('currentColor', '#ffffff'))}`;
  });
}

/**
 * Landing hero art. The 2D orbit renders first (server-side, instantly); when the browser is idle and has WebGL 2,
 * the 3D life core loads in its own chunk and fades in over it once its first frames are drawn. It pauses when
 * scrolled out of view, and holds one still frame when the visitor prefers reduced motion.
 */
export function HeroVisual({ modules }: { modules: HeroModule[] }) {
  const box = useRef<HTMLDivElement>(null);
  const hiddenIcons = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<{ moons: MoonSpec[]; tier: Tier; still: boolean } | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!webgl2() || !hiddenIcons.current) return;
    const urls = iconUrls(hiddenIcons.current);
    const start = () => setScene({ moons: modules.map((m, i) => ({ ...m, icon: urls[i] })), tier: pickTier(), still: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(start, { timeout: 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(start, 400);
    return () => window.clearTimeout(id);
  }, [modules]);

  useEffect(() => {
    const el = box.current;
    if (!el || !scene) return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, [scene]);

  // While the 3D hero is on screen the animated sky behind the page holds still: one GPU scene at a time.
  useEffect(() => {
    if (!scene || !ready || !active || scene.still) return;
    const root = document.documentElement;
    root.dataset.hero = 'on';
    return () => void delete root.dataset.hero;
  }, [scene, ready, active]);

  const ring = modules.slice(0, 12);
  return (
    <div ref={box} className="hero-visual relative mx-auto aspect-square w-full max-w-[600px]" aria-hidden="true">
      <div className={cx('absolute inset-[7%] transition-opacity duration-700', ready && 'opacity-0')}>
        <div className="glass absolute inset-[8%] !rounded-full" />
        <div className="glass absolute inset-[24%] !rounded-full" />
        <div className="absolute inset-[38%] rounded-full bg-gradient-to-br from-cyan to-violet opacity-90 blur-[2px]" />
        <div className="absolute inset-[30%] rounded-full bg-accent opacity-20 blur-2xl" />
        {ring.map((m, i) => {
          const angle = (i / ring.length) * Math.PI * 2;
          const r = i % 2 ? 42 : 26;
          return (
            <span key={m.id} className="tile absolute size-11 -translate-x-1/2 -translate-y-1/2 backdrop-blur-md" style={{ left: `${50 + Math.cos(angle) * r}%`, top: `${50 + Math.sin(angle) * r}%`, '--mh': m.hue } as CSSProperties}>
              <Icon name={m.icon} size={20} />
            </span>
          );
        })}
      </div>
      {scene && (
        <div className={cx('hero-canvas absolute inset-0 transition-opacity duration-[1400ms] ease-out', ready ? 'opacity-100' : 'opacity-0')}>
          <LifeCore moons={scene.moons} tier={scene.tier} still={scene.still} active={active} onReady={() => setReady(true)} />
        </div>
      )}
      <div ref={hiddenIcons} hidden>
        {modules.map((m) => <Icon key={m.id} name={m.icon} size={64} strokeWidth={1.7} />)}
      </div>
    </div>
  );
}

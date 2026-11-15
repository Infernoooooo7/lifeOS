'use client';

import { useEffect, useRef } from 'react';

/**
 * The animated sky behind the whole app: a nebula along a Milky Way band, two depths of stars, a few bright stars
 * that twinkle with diffraction spikes, and the occasional shooting star.
 *
 * Built so that scrolling never makes it stutter or stop:
 *   - Nothing is drawn per frame. The nebula is painted by WebGL into a canvas now and then (at start, then about
 *     every 28 s, in strips spread over several frames) and crossfades into the new state; the stars are painted once
 *     with canvas 2D at full device resolution, so they stay crisp.
 *   - All motion is CSS transform and opacity animation on a handful of layers (nebula drift, star pan, shimmer,
 *     twinkles, meteors). The browser runs those on its compositor thread, so they keep moving smoothly while the
 *     page scrolls or the main thread is busy.
 * Reduced motion (system or app setting) and software renderers get the same sky without motion. "Animated
 * background" in Settings → Appearance switches it off for this device; without WebGL 2 the static CSS sky remains.
 */

export const COSMOS_KEY = 'lifeos.cosmos';
export const COSMOS_EVENT = 'lifeos:cosmos';
export const cosmosEnabled = () => {
  try {
    return localStorage.getItem(COSMOS_KEY) !== 'off';
  } catch {
    return true;
  }
};

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const NEBULA = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uLight;
uniform vec3 uAccent;
out vec4 o;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * 2.4;
  float t = uTime * 0.018;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 3.2 * q + vec2(1.7, 9.2) + 1.4 * t), fbm(p + 3.2 * q + vec2(8.3, 2.8) - t));
  float f = fbm(p + 2.6 * r);

  // A diagonal band, like the Milky Way, where the gas is densest.
  float band = exp(-pow((uv.y - 0.52 - (uv.x - 0.5) * 0.55) * 2.3, 2.0));

  vec3 deep = vec3(0.010, 0.011, 0.032);
  vec3 indigo = vec3(0.075, 0.06, 0.26);
  vec3 violet = vec3(0.26, 0.09, 0.42);
  vec3 rose = vec3(0.46, 0.1, 0.32);
  vec3 col = deep;
  col = mix(col, indigo, smoothstep(0.22, 0.78, f));
  col = mix(col, violet, smoothstep(0.5, 0.95, length(q)) * 0.7);
  col = mix(col, uAccent * 0.5, smoothstep(0.55, 1.0, r.x) * 0.45);
  col += rose * pow(smoothstep(0.55, 1.0, f * r.y * 1.4), 2.0) * 0.35;
  float dust = fbm(p * 2.4 - r + 11.0);
  col *= 0.5 + 0.5 * smoothstep(0.28, 0.72, dust); // dark dust lanes
  col *= 0.42 + 0.72 * band;
  col += vec3(0.5, 0.55, 0.85) * pow(band, 6.0) * smoothstep(0.45, 0.8, f) * 0.06; // faint galactic glow

  col *= 1.45; // shown as is (no star pass adds light on top any more)
  if (uLight > 0.5) {
    // Daylight: the same clouds as soft pastel tints on a pale sky.
    vec3 sky = vec3(0.935, 0.94, 0.975);
    float m = clamp(dot(col, vec3(0.35, 0.45, 0.4)) * 3.2, 0.0, 1.0);
    vec3 tint = col / max(max(col.r, max(col.g, col.b)), 1e-3);
    col = mix(sky, sky * (0.55 + 0.45 * tint), m * 0.55);
  }
  o = vec4(col, 1.0);
}`;

/** Starts compiling and linking without waiting for the result: the driver works in the background. */
function build(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    gl.attachShader(p, sh);
  }
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  return p;
}

function linked(gl: WebGL2RenderingContext, p: WebGLProgram): boolean {
  if (gl.getProgramParameter(p, gl.LINK_STATUS)) return true;
  console.error('Cosmos shader:', gl.getProgramInfoLog(p), ...(gl.getAttachedShaders(p) ?? []).map((sh) => gl.getShaderInfoLog(sh)));
  return false;
}

/** The accent colour as linear RGB, resolved by the browser (it understands oklch; we do not need to). */
function accentRgb(): [number, number, number] {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5ec8ff';
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    const lin = (v: number) => Math.pow(v / 255, 2.2);
    return [lin(r), lin(g), lin(b)];
  } catch {
    return [0.1, 0.5, 1];
  }
}

/** Small deterministic random generator, so the sky looks the same from one visit to the next. */
function seeded(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paint a star field at full device resolution. Sizing the canvas clears it; it is repainted in the same task. */
function paintStars(canvas: HTMLCanvasElement, light: boolean, perPx: number, sizeMul: number, seed: number) {
  const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  if (!cssW || !cssH) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rnd = seeded(seed);
  const tints = light ? ['#4a5287', '#6a5a9c', '#4d6d98'] : ['#ffffff', '#dbe7ff', '#fff2df', '#e6dbff'];
  const count = Math.round((cssW * cssH) / perPx);
  for (let i = 0; i < count; i++) {
    const x = rnd() * cssW, y = rnd() * cssH;
    const r = (0.3 + Math.pow(rnd(), 7) * 1.5) * sizeMul;
    const alpha = (light ? 0.18 : 0.35) + rnd() * (light ? 0.2 : 0.6);
    const tint = tints[Math.floor(rnd() * tints.length)];
    if (r > 0.9 && !light) {
      const glow = g.createRadialGradient(x, y, 0, x, y, r * 4.5);
      glow.addColorStop(0, `${tint}55`);
      glow.addColorStop(1, `${tint}00`);
      g.fillStyle = glow;
      g.globalAlpha = alpha;
      g.fillRect(x - r * 4.5, y - r * 4.5, r * 9, r * 9);
    }
    g.globalAlpha = alpha;
    g.fillStyle = tint;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

/** WebGL nebula painter: compiles once, then paints frames on request, a strip at a time. */
function nebulaPainter() {
  // An OffscreenCanvas hands its picture over as an ImageBitmap without the GPU having to copy it back to the CPU
  // (drawing a WebGL canvas into a 2D one stalls the GPU). Older browsers use a plain canvas and drawImage.
  const offscreen = typeof OffscreenCanvas !== 'undefined' && typeof ImageBitmapRenderingContext !== 'undefined';
  const canvas: HTMLCanvasElement | OffscreenCanvas = offscreen ? new OffscreenCanvas(64, 64) : document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'low-power' }) as WebGL2RenderingContext | null;
  if (!gl) return null;
  const prog = build(gl, VERT, NEBULA);
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  let ready: Promise<boolean> | null = null;
  let software = false;
  let u: Record<string, WebGLUniformLocation | null> = {};
  const whenReady = () =>
    (ready ??= (async () => {
      // Poll instead of asking: asking whether a shader compiled makes the page wait for the GPU.
      while (parallel && !gl.getProgramParameter(prog, parallel.COMPLETION_STATUS_KHR)) await new Promise((r) => setTimeout(r, 50));
      if (!linked(gl, prog)) return false;
      u = Object.fromEntries(['uRes', 'uTime', 'uLight', 'uAccent'].map((n) => [n, gl.getUniformLocation(prog, n)]));
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)));
      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      return true;
    })());
  return {
    whenReady,
    isSoftware: () => software,
    /** Paint the nebula at sky time `t` into `target` (a 2D canvas), in strips over a few frames. */
    async paint(target: HTMLCanvasElement, w: number, h: number, t: number, light: boolean, accent: [number, number, number], cancelled: () => boolean) {
      if (!(await whenReady())) return false;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      gl.uniform2f(u.uRes, w, h);
      gl.uniform1f(u.uTime, t);
      gl.uniform1f(u.uLight, light ? 1 : 0);
      gl.uniform3f(u.uAccent, ...accent);
      gl.enable(gl.SCISSOR_TEST);
      const strips = 8;
      for (let i = 0; i < strips; i++) {
        if (cancelled()) return false;
        const y0 = Math.floor((i / strips) * h), y1 = Math.floor(((i + 1) / strips) * h);
        gl.scissor(0, y0, w, y1 - y0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        await nextFrame();
      }
      gl.disable(gl.SCISSOR_TEST);
      if (cancelled()) return false;
      if (canvas instanceof HTMLCanvasElement) {
        target.width = w;
        target.height = h;
        target.getContext('2d')?.drawImage(canvas, 0, 0);
      } else {
        // Zero-copy handover: the bitmap's GPU texture becomes the target canvas's picture.
        const bitmap = canvas.transferToImageBitmap();
        const ctx = target.getContext('bitmaprenderer');
        if (ctx) ctx.transferFromImageBitmap(bitmap);
        else bitmap.close();
      }
      return true;
    },
    dispose: () => gl.getExtension('WEBGL_lose_context')?.loseContext(),
  };
}

/** Bright stars that twinkle on their own (tiny composited sprites), some with diffraction spikes. */
function sparkles(host: HTMLElement, light: boolean) {
  host.replaceChildren();
  if (light) return;
  const rnd = seeded(7);
  const colors = ['#ffffff', '#cfe0ff', '#ffe9cf', '#e2d4ff'];
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('span');
    s.className = rnd() < 0.4 ? 'sky-spark spike' : 'sky-spark';
    const size = 9 + Math.pow(rnd(), 2) * 22;
    s.style.cssText = `left:${(rnd() * 100).toFixed(2)}%;top:${(rnd() * 100).toFixed(2)}%;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;--c:${colors[Math.floor(rnd() * colors.length)]};--d:${(2.2 + rnd() * 3.6).toFixed(2)}s;--dl:${(-rnd() * 6).toFixed(2)}s`;
    host.appendChild(s);
  }
}

/** Launch one shooting star (a CSS-animated streak), somewhere in the upper sky. */
function meteor(host: HTMLElement) {
  const track = document.createElement('div');
  track.className = 'sky-meteor-track';
  track.style.cssText = `left:${(30 + Math.random() * 70).toFixed(1)}%;top:${(Math.random() * 42).toFixed(1)}%;transform:rotate(${(146 + Math.random() * 16).toFixed(1)}deg)`;
  const streak = document.createElement('div');
  streak.className = 'sky-meteor';
  track.appendChild(streak);
  host.appendChild(track);
  streak.addEventListener('animationend', () => track.remove(), { once: true });
  setTimeout(() => track.remove(), 4000); // in case the animation never runs (hidden tab)
}

export function Cosmos() {
  const sky = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sky.current;
    if (!el || window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
    const root = document.documentElement;
    const [nebA, nebB] = [...el.querySelectorAll<HTMLCanvasElement>('.sky-neb')];
    const far = el.querySelector<HTMLCanvasElement>('.sky-stars-far')!;
    const near = el.querySelector<HTMLCanvasElement>('.sky-stars-near')!;
    const sparks = el.querySelector<HTMLElement>('.sky-sparks')!;
    const meteors = el.querySelector<HTMLElement>('.sky-meteors')!;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');

    let painter: ReturnType<typeof nebulaPainter> = null;
    let disposed = false;
    let front = nebA;
    let skyTime = 40 + Math.random() * 400;
    let paintId = 0; // a newer paint cancels an older one
    let evolveTimer = 0, meteorTimer = 0, resizeTimer = 0, startTimer = 0, parFrame = 0;
    let painted = { w: 0, h: 0 };
    let light = root.dataset.theme === 'light';
    let accent = accentRgb();
    let forced = false;
    try {
      forced = localStorage.getItem(COSMOS_KEY) === 'force';
    } catch {
      /* storage unavailable */
    }
    const still = () => media.matches || root.dataset.motion === 'reduced' || (!!painter?.isSoftware() && !forced);
    const animating = () => cosmosEnabled() && root.classList.contains('cosmos') && !still();

    /** Paint a new nebula into the hidden canvas, then crossfade to it. */
    const repaintNebula = async () => {
      if (!painter) return;
      const id = ++paintId;
      const box = nebA.getBoundingClientRect();
      const area = Math.max(1, box.width * box.height);
      const scale = Math.min(0.7, Math.sqrt(650_000 / area)); // ≤ 0.65 MP: soft by nature, so scaled up it stays smooth
      const w = Math.max(64, Math.round(box.width * scale)), h = Math.max(64, Math.round(box.height * scale));
      // The first nebula goes straight into the visible canvas; later ones into the hidden one, then crossfade.
      const first = !painted.w;
      const back = first ? front : front === nebA ? nebB : nebA;
      const ok = await painter.paint(back, w, h, skyTime, light, accent, () => disposed || id !== paintId);
      if (!ok) return false;
      painted = { w: box.width, h: box.height };
      if (!first) {
        const old = front;
        back.style.visibility = 'visible';
        back.style.opacity = '1';
        old.style.opacity = '0';
        front = back;
        // Once faded out, the old canvas leaves the compositor entirely until the next crossfade.
        window.setTimeout(() => old !== front && (old.style.visibility = 'hidden'), 7500);
      }
      return true;
    };

    const paintAllStars = () => {
      paintStars(far, light, 2600, 1, 11);
      paintStars(near, light, 9000, 1.35, 23);
      sparkles(sparks, light);
    };

    const scheduleEvolve = () => {
      window.clearTimeout(evolveTimer);
      evolveTimer = window.setTimeout(async () => {
        if (animating() && !document.hidden) {
          skyTime += 24;
          await repaintNebula();
        }
        if (!disposed) scheduleEvolve();
      }, 28_000);
    };
    const scheduleMeteor = () => {
      window.clearTimeout(meteorTimer);
      meteorTimer = window.setTimeout(() => {
        if (animating() && !document.hidden && !light) meteor(meteors);
        if (!disposed) scheduleMeteor();
      }, 6000 + Math.random() * 8000);
    };

    const applyMode = () => {
      const on = cosmosEnabled();
      root.classList.toggle('cosmos', on && painted.w > 0);
      root.classList.toggle('cosmos-still', on && still());
    };

    const start = async () => {
      painter = nebulaPainter();
      if (!painter || !(await painter.whenReady()) || disposed) return;
      paintAllStars();
      if (!(await repaintNebula()) || disposed) return;
      applyMode();
      scheduleEvolve();
      scheduleMeteor();
    };

    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const box = nebA.getBoundingClientRect();
        // Stars: repaint when the layer outgrew its pixels (synchronous, so nothing is ever shown cleared).
        if (Math.abs(far.clientWidth * Math.min(window.devicePixelRatio || 1, 2) - far.width) > 2 || Math.abs(far.clientHeight * Math.min(window.devicePixelRatio || 1, 2) - far.height) > 40) paintAllStars();
        // Nebula: the old one keeps showing (stretched) until the new one is ready.
        if (Math.abs(box.width - painted.w) / painted.w > 0.2 || Math.abs(box.height - painted.h) / painted.h > 0.2) void repaintNebula();
      }, 400);
    };
    const onToggle = () => {
      applyMode();
      if (cosmosEnabled() && !painted.w) void start();
    };
    const themeWatch = new MutationObserver(() => {
      const nextLight = root.dataset.theme === 'light';
      const nextAccent = accentRgb();
      if (nextLight === light && nextAccent.every((v, i) => Math.abs(v - accent[i]) < 1e-3)) return;
      light = nextLight;
      accent = nextAccent;
      if (!painted.w) return;
      paintAllStars();
      void repaintNebula();
    });
    themeWatch.observe(root, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    const modeWatch = new MutationObserver(applyMode);
    modeWatch.observe(root, { attributes: true, attributeFilter: ['data-motion'] });

    // Pointer parallax on desktop: two depths drift a few pixels toward the pointer (eased by a CSS transition).
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const parFar = el.querySelector<HTMLElement>('.sky-par-far')!, parNear = el.querySelector<HTMLElement>('.sky-par-near')!;
    let px = 0, py = 0;
    const onPointer = (e: PointerEvent) => {
      px = e.clientX / window.innerWidth - 0.5;
      py = e.clientY / window.innerHeight - 0.5;
      if (parFrame || !animating()) return;
      parFrame = requestAnimationFrame(() => {
        parFrame = 0;
        parFar.style.transform = `translate3d(${(-px * 8).toFixed(1)}px, ${(-py * 6).toFixed(1)}px, 0)`;
        parNear.style.transform = `translate3d(${(-px * 20).toFixed(1)}px, ${(-py * 14).toFixed(1)}px, 0)`;
      });
    };

    // Start once the app has painted and the browser is idle: the static sky shows until then.
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const go = () => void (cosmosEnabled() ? start() : undefined);
    startTimer = w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 2500 }) : window.setTimeout(go, 600);
    window.addEventListener('resize', onResize);
    window.addEventListener(COSMOS_EVENT, onToggle);
    media.addEventListener('change', applyMode);
    if (fine) window.addEventListener('pointermove', onPointer, { passive: true });
    return () => {
      disposed = true;
      if (w.cancelIdleCallback) w.cancelIdleCallback(startTimer);
      else window.clearTimeout(startTimer);
      [evolveTimer, meteorTimer, resizeTimer].forEach((t) => window.clearTimeout(t));
      cancelAnimationFrame(parFrame);
      themeWatch.disconnect();
      modeWatch.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener(COSMOS_EVENT, onToggle);
      media.removeEventListener('change', applyMode);
      window.removeEventListener('pointermove', onPointer);
      root.classList.remove('cosmos', 'cosmos-still');
      painter?.dispose();
    };
  }, []);

  return (
    <div ref={sky} className="cosmos-sky" aria-hidden="true">
      <div className="sky-par sky-par-far">
        <div className="sky-drift">
          <canvas className="sky-neb" style={{ opacity: 1 }} />
          <canvas className="sky-neb" style={{ opacity: 0, visibility: 'hidden' }} />
        </div>
        <canvas className="sky-stars sky-stars-far" />
      </div>
      <div className="sky-par sky-par-near">
        <canvas className="sky-stars sky-stars-near" />
        <div className="sky-sparks" />
      </div>
      <div className="sky-meteors" />
    </div>
  );
}

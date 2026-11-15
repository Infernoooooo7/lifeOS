'use client';

import { useEffect, useRef } from 'react';

/**
 * The animated sky behind the whole app: a slowly evolving nebula along a Milky Way band, three parallax layers of
 * twinkling stars (the brightest with diffraction spikes) and the occasional shooting star. Raw WebGL 2 in two passes
 * so it stays cheap:
 *   1. the nebula (domain-warped fbm, the expensive part) renders into small keyframe textures at ~⅓ resolution,
 *      1.2 s of sky time apart; the screen crossfades between two while the next is drawn one strip per frame, so
 *      every frame costs about the same;
 *   2. a screen pass upsamples it and adds the stars and meteors.
 * Stars are baked once into a repeating texture; each frame samples it three times. Capped at 24 fps, held still
 * while the page scrolls, paused in hidden tabs, one still frame under prefers-reduced-motion, and switched off with
 * "Animated background" in Settings → Appearance. Software renderers get one still frame. Without WebGL 2 the static CSS
 * sky stays in place.
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
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
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

  if (uLight > 0.5) {
    // Daylight: the same clouds as soft pastel tints on a pale sky.
    vec3 sky = vec3(0.935, 0.94, 0.975);
    float m = clamp(dot(col, vec3(0.35, 0.45, 0.4)) * 3.2, 0.0, 1.0);
    vec3 tint = col / max(max(col.r, max(col.g, col.b)), 1e-3);
    col = mix(sky, sky * (0.55 + 0.45 * tint), m * 0.55);
  }
  o = vec4(col, 1.0);
}`;

/** Baked once at start-up: a repeating 512² tile of stars. RGB is the star, alpha its twinkle phase. */
const STARS = `#version 300 es
precision highp float;
out vec4 o;
float h21(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
void main() {
  vec2 px = gl_FragCoord.xy;
  vec3 col = vec3(0.0);
  float phase = 0.0;
  // Check this cell and its neighbours so large stars and spikes are never cut off at a cell edge.
  const float cell = 32.0;
  vec2 base = floor(px / cell);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 id = mod(base + vec2(i, j), 512.0 / cell); // wraps, so the tile repeats seamlessly
    float h = h21(id);
    if (h > 0.5) continue;
    vec2 centre = (base + vec2(i, j) + 0.5 + (vec2(h21(id + 3.1), h21(id + 7.7)) - 0.5) * 0.8) * cell;
    vec2 d = px - centre;
    float size = 0.5 + pow(h21(id + 1.3), 7.0) * 2.6;
    float core = exp(-dot(d, d) / (size * size));
    float sp = 0.0;
    if (h21(id + 2.2) > 0.96) {
      vec2 a = abs(d);
      sp = (exp(-a.x / (size * 0.3)) * exp(-a.y / (size * 5.5)) + exp(-a.y / (size * 0.3)) * exp(-a.x / (size * 5.5))) * 0.5;
    }
    float k = h21(id + 5.5);
    vec3 tint = k < 0.33 ? vec3(0.72, 0.84, 1.0) : k < 0.66 ? vec3(1.0, 0.94, 0.86) : vec3(0.86, 0.78, 1.0);
    float v = core + sp;
    if (v > 0.002) { col += tint * v; phase = h; }
  }
  o = vec4(min(col, vec3(1.0)), phase * 2.0);
}`;

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uNebulaA;
uniform sampler2D uNebulaB;
uniform float uMix;
uniform sampler2D uStars;
uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
uniform vec2 uParallax;
uniform float uLight;
uniform vec4 uMeteor; // head x, head y (CSS px), progress, on
uniform vec2 uMeteorDir;
out vec4 o;
float h21(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
vec3 layer(vec2 px, float scale, vec2 shift, float speed) {
  vec4 s = texture(uStars, (px * scale + shift) / 512.0);
  float tw = 0.55 + 0.45 * sin(uTime * (0.8 + s.a * 2.2) * speed + s.a * 90.0);
  return s.rgb * tw;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = mix(texture(uNebulaA, uv).rgb, texture(uNebulaB, uv).rgb, uMix);
  vec2 px = gl_FragCoord.xy / uDpr; // CSS pixels, so stars look the same on every screen
  vec3 s = layer(px, 1.7, uParallax * 6.0 + vec2(uTime * 0.6, 37.0), 1.0) * 0.55;
  s += layer(px, 1.0, uParallax * 14.0 + vec2(uTime * 1.3 + 300.0, uTime * 0.2 + 500.0), 1.3);
  s += layer(px, 0.55, uParallax * 28.0 + vec2(uTime * 2.4 + 640.0, uTime * 0.5 + 210.0), 0.8) * 1.15;
  float m = 0.0;
  if (uMeteor.w > 0.5) {
    vec2 rel = px - uMeteor.xy;
    float along = dot(rel, -uMeteorDir);
    float across = abs(dot(rel, vec2(-uMeteorDir.y, uMeteorDir.x)));
    float tail = uRes.y / uDpr * 0.16;
    m = step(0.0, along) * (1.0 - smoothstep(0.0, tail, along)) * exp(-across * across / 1.1);
    m += exp(-dot(rel, rel) / 5.0) * 1.5;
    m *= sin(uMeteor.z * 3.14159);
  }
  if (uLight > 0.5) {
    col -= (s * 0.06 + m * 0.08) * vec3(0.5, 0.45, 0.2);
  } else {
    col += s * (0.75 + 0.5 * dot(col, vec3(1.0)));
    col += vec3(0.75, 0.88, 1.0) * m;
  }
  col += (h21(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0; // dither: no banding in the dark gradients
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

/** Sets the sky up on a canvas and runs it; returns the teardown, or nothing when it cannot run here. */
function mount(el: HTMLCanvasElement): (() => void) | undefined {
  if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
  const gl = el.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
  if (!gl) return;
  // Asking whether a shader compiled makes the page wait for the GPU. With parallel compilation we poll until the
  // driver is done instead, so the sky never blocks typing, scrolling or a toast.
  const progs = [build(gl, VERT, NEBULA), build(gl, VERT, COMPOSITE), build(gl, VERT, STARS)] as const;
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  let stop: (() => void) | undefined;
  let timer = 0;
  let cancelled = false;
  const wait = () => {
    if (cancelled) return;
    if (parallel && !progs.every((p) => gl.getProgramParameter(p, parallel.COMPLETION_STATUS_KHR))) {
      timer = window.setTimeout(wait, 60);
      return;
    }
    if (progs.every((p) => linked(gl, p))) stop = run(el, gl, ...progs);
  };
  wait();
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (stop) stop();
    else gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}

/** How much the sky may do: 0 = full, 1 = 12 fps at lower resolution, 2 = one still frame. Kept for the browser session. */
const LEVEL_KEY = 'lifeos.cosmos.level';
const readLevel = () => {
  try {
    return Math.min(2, Number(sessionStorage.getItem(LEVEL_KEY)) || 0);
  } catch {
    return 0;
  }
};
const saveLevel = (n: number) => {
  try {
    sessionStorage.setItem(LEVEL_KEY, String(n));
  } catch {
    /* private mode: the level applies until reload */
  }
};

/** Seconds of sky time between two nebula keyframes; the screen crossfades between them. */
const KEY_STEP = 1.2;
/** Each new keyframe is drawn in this many horizontal strips, one per frame, so no frame does all the work. */
const STRIPS = 12;

/** Runs the sky once its programs are ready; returns the teardown. */
function run(el: HTMLCanvasElement, gl: WebGL2RenderingContext, nebulaProg: WebGLProgram, compProg: WebGLProgram, starProg: WebGLProgram): () => void {
  const root = document.documentElement;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one oversized triangle
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Every synchronous query comes before any GPU work is queued: a query issued behind queued work makes the page
  // wait for that work to finish.
  const U = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const nu = { res: U(nebulaProg, 'uRes'), time: U(nebulaProg, 'uTime'), light: U(nebulaProg, 'uLight'), accent: U(nebulaProg, 'uAccent') };
  const cu = { a: U(compProg, 'uNebulaA'), b: U(compProg, 'uNebulaB'), mix: U(compProg, 'uMix'), stars: U(compProg, 'uStars'), res: U(compProg, 'uRes'), dpr: U(compProg, 'uDpr'), time: U(compProg, 'uTime'), par: U(compProg, 'uParallax'), light: U(compProg, 'uLight'), meteor: U(compProg, 'uMeteor'), meteorDir: U(compProg, 'uMeteorDir') };
  // A software renderer (no GPU acceleration) would spend the CPU on the sky every frame: draw it once instead.
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  // ('force' is a developer override that animates anyway — the way to test the sky on a slow GPU.)
  let forced = false;
  try {
    forced = localStorage.getItem(COSMOS_KEY) === 'force';
  } catch {
    /* storage unavailable */
  }
  const software = !forced && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  const rnd = (k: number, s: number) => {
    const x = Math.sin(k * 127.1 + s * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  // Star tile, baked once.
  const starTex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, starTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, starTex, 0);
  gl.viewport(0, 0, 512, 512);
  gl.useProgram(starProg);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindTexture(gl.TEXTURE_2D, starTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);

  // Three nebula keyframes: the screen shows a crossfade from `from` to `to` while `next` is drawn strip by strip.
  let [from, to, next] = [gl.createTexture()!, gl.createTexture()!, gl.createTexture()!];
  let toTime = 0; // sky time of the `to` keyframe; `from` is one step earlier, `next` one step later
  let strip = 0; // strips of `next` drawn so far

  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  let level = readLevel();
  const holdStill = () => software || level >= 2 || media.matches || root.dataset.motion === 'reduced' || root.dataset.hero === 'on';
  let cssW = 0, cssH = 0, dpr = 1, w = 0, h = 0, nw = 0, nh = 0;
  let light = root.dataset.theme === 'light' ? 1 : 0;
  let accent = accentRgb();
  let raf = 0, last = 0, time = 40 + Math.random() * 400, scrolledAt = 0, prevTick = 0;
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  let enabled = cosmosEnabled();
  const intervals: number[] = [];
  let judgedAt = 0;

  const nebula = (target: WebGLTexture, at: number, from = 0, rows = nh) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.viewport(0, 0, nw, nh);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, from, nw, rows);
    gl.useProgram(nebulaProg);
    gl.uniform2f(nu.res, nw, nh);
    gl.uniform1f(nu.time, at);
    gl.uniform1f(nu.light, light);
    gl.uniform3f(nu.accent, ...accent);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
  };

  /** Redraw both visible keyframes from scratch (start, resize, theme or accent change). */
  const rebuild = () => {
    toTime = time + KEY_STEP;
    nebula(from, time);
    nebula(to, toTime);
    strip = 0;
  };

  /** Size the drawing buffer; returns true when it changed (which clears the canvas, so the caller redraws at once). */
  const size = (): boolean => {
    const r = el.getBoundingClientRect();
    const cw = Math.max(1, Math.round(r.width));
    const ch = Math.max(1, Math.round(r.height));
    // Sharp on phones (up to 2× when the pixel budget allows), capped on very large monitors.
    const budget = (coarse ? 1.0e6 : 2.2e6) / (level >= 1 ? 2 : 1);
    const want = Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(budget / (cw * ch))));
    if (cw === cssW && ch === cssH && Math.abs(want - dpr) < 0.01 && w) return false;
    cssW = cw;
    cssH = ch;
    dpr = want;
    w = Math.round(cw * dpr);
    h = Math.round(ch * dpr);
    el.width = w;
    el.height = h;
    nw = Math.max(64, Math.round(cw * 0.34));
    nh = Math.max(64, Math.round(ch * 0.34));
    for (const t of [from, to, next]) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, nw, nh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    rebuild();
    return true;
  };

  const composite = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, from);
    gl.uniform1i(cu.a, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, to);
    gl.uniform1i(cu.b, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, starTex);
    gl.uniform1i(cu.stars, 2);
    gl.uniform1f(cu.mix, Math.min(1, Math.max(0, 1 - (toTime - time) / KEY_STEP)));
    // A shooting star every few periods; its maths only runs in the shader while one is flying.
    const period = 7.5;
    const k = Math.floor(time / period);
    const lt = time - k * period;
    if (rnd(k, 4.2) >= 0.4 && lt < 1.1 && !holdStill()) {
      const dx = -0.75 - rnd(k, 3) * 0.5, dy = -0.42;
      const len = Math.hypot(dx, dy);
      const prog = lt / 1.1;
      const sx = (0.25 + rnd(k, 1) * 0.9) * cssW, sy = (0.55 + rnd(k, 2) * 0.4) * cssH;
      gl.uniform4f(cu.meteor, sx + (dx / len) * prog * cssH * 0.75, sy + (dy / len) * prog * cssH * 0.75, prog, 1);
      gl.uniform2f(cu.meteorDir, dx / len, dy / len);
    } else gl.uniform4f(cu.meteor, 0, 0, 0, 0);
    gl.uniform2f(cu.res, w, h);
    gl.uniform1f(cu.dpr, dpr);
    gl.uniform1f(cu.time, time);
    gl.uniform2f(cu.par, par.x, par.y);
    gl.uniform1f(cu.light, light);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  /** One animation step: advance the keyframes by a strip, roll them over when due, and draw the screen. */
  const step = () => {
    if (time >= toTime) {
      // Due: finish any strips a slow frame left undrawn, then roll the keyframes forward.
      if (strip < STRIPS) nebula(next, toTime + KEY_STEP, Math.floor((strip / STRIPS) * nh), nh);
      [from, to, next] = [to, next, from];
      toTime += KEY_STEP;
      strip = 0;
      if (time >= toTime) rebuild(); // fell far behind (e.g. a long pause): start over from now
    } else if (strip < STRIPS) {
      const y0 = Math.floor((strip / STRIPS) * nh);
      const y1 = Math.floor(((strip + 1) / STRIPS) * nh);
      nebula(next, toTime + KEY_STEP, y0, y1 - y0);
      strip++;
    }
    composite();
  };

  /** If the whole page keeps running slowly while the sky animates, step down once and stay there. */
  const judge = (now: number) => {
    if (now - judgedAt < 2500 || intervals.length < 30) return;
    judgedAt = now;
    const sorted = [...intervals].sort((a, b) => a - b);
    intervals.length = 0;
    if (sorted[Math.floor(sorted.length / 2)] <= 28) return; // page at ~36 fps or better: fine
    level = Math.min(2, level + 1);
    saveLevel(level);
    el.dataset.level = String(level);
    if (size()) composite(); // level 1 also halves the pixel budget; redraw at once, never leave a cleared canvas
    if (level >= 2) start();
  };

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const gap = now - prevTick;
    prevTick = now;
    if (gap > 0 && gap < 250) {
      intervals.push(gap);
      if (intervals.length > 120) intervals.shift();
    }
    const dt = now - last;
    if (dt < (level >= 1 ? 80 : 40)) return; // 24 fps, or 12 when stepped down: plenty for a drifting sky
    if (now - scrolledAt < 250) {
      last = now; // hold still while the page scrolls: scrolling gets the whole frame budget
      intervals.length = 0;
      return;
    }
    last = now;
    time += Math.min(dt, 100) / 1000;
    par.x += (par.tx - par.x) * 0.05;
    par.y += (par.ty - par.y) * 0.05;
    step();
    judge(now);
  };

  const start = () => {
    cancelAnimationFrame(raf);
    if (!enabled) {
      root.classList.remove('cosmos');
      return;
    }
    root.classList.add('cosmos');
    if (size()) composite();
    if (holdStill()) composite();
    else if (!document.hidden) {
      last = prevTick = performance.now();
      intervals.length = 0;
      raf = requestAnimationFrame(loop);
    }
  };

  const onPointer = (e: PointerEvent) => {
    par.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    par.ty = (e.clientY / window.innerHeight - 0.5) * -2;
  };
  const onScroll = () => void (scrolledAt = performance.now());
  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (enabled && size()) composite(); // redrawn in the same task: the cleared canvas is never shown
    }, 120);
  };
  const onToggle = () => {
    enabled = cosmosEnabled();
    if (enabled) {
      level = 0; // switched back on by hand: give it a fresh chance
      saveLevel(0);
    }
    start();
  };
  const themeWatch = new MutationObserver(() => {
    const nextLight = root.dataset.theme === 'light' ? 1 : 0;
    const nextAccent = accentRgb();
    if (nextLight === light && nextAccent.every((v, i) => Math.abs(v - accent[i]) < 1e-3)) return;
    light = nextLight;
    accent = nextAccent;
    if (!w) return;
    rebuild();
    composite();
  });
  themeWatch.observe(root, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  const modeWatch = new MutationObserver(start);
  modeWatch.observe(root, { attributes: true, attributeFilter: ['data-motion', 'data-hero'] });
  const onLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    root.classList.remove('cosmos');
  };

  el.dataset.level = String(level); // visible to tests and to anyone inspecting the page
  start();
  window.addEventListener('resize', onResize);
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true, capture: true }); // capture: the app scrolls inner panes
  window.addEventListener('wheel', onScroll, { passive: true });
  window.addEventListener('touchmove', onScroll, { passive: true });
  document.addEventListener('visibilitychange', start);
  window.addEventListener(COSMOS_EVENT, onToggle);
  media.addEventListener('change', start);
  el.addEventListener('webglcontextlost', onLost);
  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(resizeTimer);
    themeWatch.disconnect();
    modeWatch.disconnect();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('wheel', onScroll);
    window.removeEventListener('touchmove', onScroll);
    document.removeEventListener('visibilitychange', start);
    window.removeEventListener(COSMOS_EVENT, onToggle);
    media.removeEventListener('change', start);
    el.removeEventListener('webglcontextlost', onLost);
    root.classList.remove('cosmos');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}

export function Cosmos() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    // Start once the app has painted and the browser is idle: the static sky shows until then.
    let stop: (() => void) | undefined;
    let cancelled = false;
    const go = () => void (!cancelled && (stop = mount(el)));
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const id = w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 2500 }) : window.setTimeout(go, 600);
    return () => {
      cancelled = true;
      if (w.cancelIdleCallback) w.cancelIdleCallback(id);
      else window.clearTimeout(id);
      stop?.();
    };
  }, []);
  return <canvas ref={canvas} className="cosmos-canvas" aria-hidden="true" />;
}

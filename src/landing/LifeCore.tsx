'use client';

import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { NOISE, POINT_FRAG } from './glsl';

/**
 * The landing page's "life core": every module of LIFEOS as a glass moon in orbit around one shared core of data,
 * with packets of data flowing between them. Everything is procedural — shaders, particles and canvas-drawn icons —
 * so nothing is downloaded and the strict content-security policy holds.
 */

export interface MoonSpec { id: string; name: string; tagline: string; hue: number; icon: string }
export interface Tier { high: boolean; dpr: [number, number]; disk: number; stars: number; detail: number; octaves: number }

const CYAN = new THREE.Color('#5ee7ff');
const BLUE = new THREE.Color('#4c7dff');
const VIOLET = new THREE.Color('#a66bff');
const SHELLS = [
  { r: 3.05, tilt: new THREE.Euler(0.12, 0, 0.1) },
  { r: 4.15, tilt: new THREE.Euler(-0.2, 0.4, -0.16) },
  { r: 5.3, tilt: new THREE.Euler(0.3, -0.3, 0.22) },
];
/** OKLCH hue (as used by the UI) to a vivid linear colour. */
const hueColor = (h: number, l = 0.6) => new THREE.Color().setHSL(((((h - 22) % 360) + 360) % 360) / 360, 0.85, l);

// ── shared clock: pauses cleanly, frozen when motion is reduced ─────────────────────────────────────

function useClock(still: boolean) {
  const t = useRef(still ? 14 : 0);
  useFrame((_, dt) => {
    if (!still) t.current += Math.min(dt, 1 / 20);
  }, -1);
  return t;
}

// ── nebula backdrop ─────────────────────────────────────────────────────────────────────────────────

function Nebula({ time, octaves }: { time: React.RefObject<number>; octaves: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        defines: { OCTAVES: octaves },
        uniforms: { uTime: { value: 0 }, uBase: { value: new THREE.Color('#03050c') }, uC1: { value: BLUE.clone().multiplyScalar(0.2) }, uC2: { value: VIOLET.clone().multiplyScalar(0.2) }, uC3: { value: CYAN.clone().multiplyScalar(0.14) } },
        vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          ${NOISE}
          uniform float uTime; uniform vec3 uBase; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float n1 = fbm(d * 1.8 + vec3(uTime * 0.012, 0.0, -uTime * 0.008));
            float n2 = fbm(d * 3.6 + vec3(4.0, -uTime * 0.01, 2.0));
            float dust = fbm(d * 9.0 + 7.0);
            vec3 col = uBase;
            col += uC1 * smoothstep(0.0, 0.65, n1);
            col += uC2 * smoothstep(0.05, 0.75, n2) * (0.6 + 0.4 * n1);
            col += uC3 * pow(max(n1 * n2, 0.0), 1.5) * 2.0;
            col *= 1.0 - 0.55 * smoothstep(0.1, 0.6, dust); // dark dust lanes
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [octaves],
  );
  useFrame(() => void (mat.uniforms.uTime.value = time.current));
  return <mesh material={mat}><sphereGeometry args={[80, 48, 32]} /></mesh>;
}

// ── starfield ───────────────────────────────────────────────────────────────────────────────────────

function Stars({ count, time }: { count: number; time: React.RefObject<number> }) {
  const { geo, mat } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const tint = [new THREE.Color('#ffffff'), new THREE.Color('#bfe9ff'), new THREE.Color('#d9c8ff'), new THREE.Color('#fff1d6')];
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = 32 + Math.random() * 40;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * s * r, u * r, Math.sin(a) * s * r], i * 3);
      const c = tint[(Math.random() * tint.length) | 0];
      col.set([c.r, c.g, c.b], i * 3);
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPixel: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uPixel;
        attribute vec3 aColor; attribute float aSeed;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 2.2) + aSeed * 61.0);
          vColor = aColor * (0.45 + aSeed * aSeed * 1.6);
          vAlpha = tw;
          gl_PointSize = uPixel * (1.2 + pow(aSeed, 6.0) * 5.0);
        }`,
      fragmentShader: POINT_FRAG,
    });
    return { geo, mat };
  }, [count]);
  const dpr = useThree((s) => s.viewport.dpr);
  useFrame(() => {
    mat.uniforms.uTime.value = time.current;
    mat.uniforms.uPixel.value = dpr;
  });
  useEffect(() => () => (geo.dispose(), mat.dispose()), [geo, mat]);
  return <points geometry={geo} material={mat} />;
}

// ── the core: plasma heart, glass shell, geodesic lattice, rings ────────────────────────────────────

function Core({ tier, time }: { tier: Tier; time: React.RefObject<number> }) {
  const plasma = useMemo(
    () =>
      new THREE.ShaderMaterial({
        defines: { OCTAVES: Math.min(tier.octaves, 4) },
        uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color('#0b2a7a') }, uB: { value: CYAN.clone() }, uC: { value: VIOLET.clone() } },
        vertexShader: /* glsl */ `
          ${NOISE}
          uniform float uTime;
          varying vec3 vNormal; varying vec3 vView; varying float vNoise; varying vec3 vObj;
          void main() {
            vec3 dir = normalize(position);
            float n = fbm(dir * 1.7 + vec3(0.0, uTime * 0.16, uTime * 0.1));
            vNoise = n;
            vObj = dir;
            vec3 p = position + normal * n * 0.11;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC;
          varying vec3 vNormal; varying vec3 vView; varying float vNoise; varying vec3 vObj;
          void main() {
            float facing = max(dot(normalize(vNormal), normalize(vView)), 0.0);
            float fres = pow(1.0 - facing, 2.6);
            vec3 col = mix(uA, uB * 0.9, smoothstep(-0.45, 0.55, vNoise));
            col = mix(col, uC, 0.35 + 0.35 * sin(vNoise * 7.0 + uTime * 0.7));
            float ridge = 1.0 - abs(fract(vNoise * 5.0 + uTime * 0.12) - 0.5) * 2.0;
            col += vec3(0.55, 0.95, 1.25) * pow(smoothstep(0.84, 1.0, ridge), 2.0) * 1.2; // filaments
            col += uB * fres * 1.5;
            col += vec3(1.0, 0.9, 1.1) * pow(facing, 18.0) * 0.35; // hot centre
            gl_FragColor = vec4(col * 0.8, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [tier.octaves],
  );
  // Thin-film glass: clear in the middle, an iridescent fresnel rim, and a sharp highlight from a fixed key light.
  const glass = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uKey: { value: new THREE.Vector3(-0.55, 0.7, 0.45).normalize() } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV; varying vec3 vW;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(-mv.xyz);
            vW = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uKey;
          varying vec3 vN; varying vec3 vV; varying vec3 vW;
          vec3 film(float x) { return 0.5 + 0.5 * cos(6.2831 * (x + vec3(0.0, 0.33, 0.67))); }
          void main() {
            vec3 n = normalize(vN);
            vec3 v = normalize(vV);
            float facing = max(dot(n, v), 0.0);
            float fres = pow(1.0 - facing, 3.2);
            vec3 col = film(facing * 1.7 + vW.y * 0.25 + uTime * 0.02) * fres * 1.1;
            vec3 r = reflect(-v, n);
            float spec = pow(max(dot(r, normalize(uKey)), 0.0), 220.0);
            float soft = pow(max(dot(r, normalize(uKey)), 0.0), 18.0);
            float rim2 = pow(max(dot(r, normalize(vec3(0.7, -0.3, 0.6))), 0.0), 60.0);
            col += vec3(1.0) * spec * 3.0 + vec3(0.7, 0.85, 1.0) * soft * 0.12 + vec3(0.6, 0.9, 1.0) * rim2 * 0.6;
            float alpha = clamp(fres * 0.9 + spec + soft * 0.08 + 0.02, 0.0, 1.0);
            gl_FragColor = vec4(col, alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  const lattice = useMemo(() => {
    const ico = new THREE.IcosahedronGeometry(1.86, 3);
    const edges = new THREE.EdgesGeometry(ico, 1);
    const nodes = new THREE.BufferGeometry().setAttribute('position', ico.getAttribute('position'));
    return { edges, nodes };
  }, []);
  const plasmaRef = useRef<THREE.Mesh>(null);
  const latticeRef = useRef<THREE.Group>(null);
  const rings = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = time.current;
    plasma.uniforms.uTime.value = t;
    glass.uniforms.uTime.value = t;
    if (plasmaRef.current) plasmaRef.current.rotation.y = t * 0.06;
    if (latticeRef.current) latticeRef.current.rotation.set(t * 0.03, -t * 0.045, 0);
    rings.current?.children.forEach((r, i) => (r.rotation.z = t * (0.12 + i * 0.07) * (i % 2 ? -1 : 1)));
  });
  return (
    <group>
      <mesh ref={plasmaRef} material={plasma}><icosahedronGeometry args={[1, tier.detail]} /></mesh>
      <mesh material={glass} renderOrder={2}><sphereGeometry args={[1.5, tier.high ? 96 : 48, tier.high ? 64 : 32]} /></mesh>
      <group ref={latticeRef}>
        <lineSegments geometry={lattice.edges}><lineBasicMaterial color={CYAN} transparent opacity={0.13} blending={THREE.AdditiveBlending} depthWrite={false} /></lineSegments>
        <points geometry={lattice.nodes}><pointsMaterial color={new THREE.Color(0.7, 1.4, 2.2)} size={0.022} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} /></points>
      </group>
      <group ref={rings}>
        {[[2.08, 0.012, 1.2, 0.0], [2.32, 0.006, 1.45, 0.5], [2.5, 0.004, 1.65, -0.35]].map(([r, w, rx, ry], i) => (
          <mesh key={i} rotation={[rx, ry, 0]}>
            <torusGeometry args={[r, w, 8, 320]} />
            <meshBasicMaterial color={i === 1 ? new THREE.Color(1.6, 1.0, 2.6) : new THREE.Color(0.8, 1.9, 2.6)} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <pointLight color={CYAN} intensity={7} distance={14} decay={2} />
      <pointLight color={VIOLET} intensity={3} distance={10} decay={2} position={[0, 2.5, 0]} />
    </group>
  );
}

// ── accretion disc: tens of thousands of particles on Keplerian orbits, computed on the GPU ──────────

function Disc({ count, time }: { count: number; time: React.RefObject<number> }) {
  const { geo, mat } = useMemo(() => {
    const radius = new Float32Array(count);
    const angle = new Float32Array(count);
    const height = new Float32Array(count);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Denser near the inner edge, with a few faint gaps like real rings.
      let r = 2.3 + Math.pow(Math.random(), 1.7) * 4.4;
      if (Math.abs(r - 3.6) < 0.07 || Math.abs(r - 4.75) < 0.05) r += 0.16;
      radius[i] = r;
      angle[i] = Math.random() * Math.PI * 2;
      const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      height[i] = g * 0.05 * r;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3)); // placed in the shader
    geo.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
    geo.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1));
    geo.setAttribute('aY', new THREE.BufferAttribute(height, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPixel: { value: 1 }, uInner: { value: new THREE.Color(0.75, 1.0, 1.25) }, uMid: { value: CYAN.clone().multiplyScalar(0.62) }, uOuter: { value: VIOLET.clone().multiplyScalar(0.55) } },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uPixel; uniform vec3 uInner; uniform vec3 uMid; uniform vec3 uOuter;
        attribute float aRadius; attribute float aAngle; attribute float aY; attribute float aSeed;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float speed = 2.1 / pow(aRadius, 1.5);
          float a = aAngle + uTime * speed * 0.42;
          float r = aRadius + sin(a * 3.0 + aSeed * 6.2831 + uTime * 0.35) * 0.035 * aRadius;
          vec3 p = vec3(cos(a) * r, aY + sin(a * 2.0 + aSeed * 9.0) * 0.02, sin(a) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float t = smoothstep(2.3, 6.7, aRadius);
          vColor = mix(mix(uInner, uMid, smoothstep(0.0, 0.3, t)), uOuter, smoothstep(0.3, 1.0, t));
          float clump = 0.55 + 0.45 * sin(a * 7.0 - uTime * 0.3 + aRadius * 4.0);
          vAlpha = 0.42 * (1.0 - t * 0.75) * (0.35 + 0.65 * clump) * (0.6 + 0.4 * sin(uTime * 1.3 + aSeed * 50.0));
          gl_PointSize = uPixel * (0.9 + aSeed * aSeed * 2.2) * (9.0 / -mv.z);
        }`,
      fragmentShader: POINT_FRAG,
    });
    return { geo, mat };
  }, [count]);
  const dpr = useThree((s) => s.viewport.dpr);
  useFrame(() => {
    mat.uniforms.uTime.value = time.current;
    mat.uniforms.uPixel.value = dpr;
  });
  useEffect(() => () => (geo.dispose(), mat.dispose()), [geo, mat]);
  return <points geometry={geo} material={mat} rotation={[0.32, 0, -0.14]} />;
}

// ── module moons, their orbits, and the data flowing between them and the core ──────────────────────

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function iconTexture(src: string, onLoad: () => void): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const img = new Image();
  img.onload = () => {
    const g = c.getContext('2d')!;
    g.shadowColor = 'rgba(190,240,255,0.9)';
    g.shadowBlur = 10;
    g.drawImage(img, 24, 24, 80, 80);
    t.needsUpdate = true;
    onLoad();
  };
  img.src = src;
  return t;
}

function labelTexture(name: string, tagline: string, color: THREE.Color): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 176;
  const g = c.getContext('2d')!;
  const r = 40;
  g.beginPath();
  g.roundRect(6, 6, 628, 164, r);
  g.fillStyle = 'rgba(8,12,24,0.78)';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = `#${color.getHexString()}`;
  g.stroke();
  g.fillStyle = 'rgba(240,246,255,0.95)';
  g.font = '600 54px "Geist Variable", system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(name, 320, 78);
  g.fillStyle = 'rgba(170,185,210,0.95)';
  g.font = '400 34px "Geist Variable", system-ui, sans-serif';
  g.fillText(tagline.length > 34 ? `${tagline.slice(0, 33)}…` : tagline, 320, 132);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface MoonState { spec: MoonSpec; shell: number; phase: number; speed: number; color: THREE.Color; pos: THREE.Vector3 }

const SEGMENTS = 28;
const PACKETS = 4;

function Moons({ moons, time, interactive }: { moons: MoonSpec[]; time: React.RefObject<number>; interactive: boolean }) {
  const { camera, invalidate } = useThree();
  const [hovered, setHovered] = useState<number | null>(null);
  const glow = useMemo(glowTexture, []);
  const states = useMemo<MoonState[]>(() => {
    const perShell = [0, 0, 0];
    const counts = [0, 0, 0];
    moons.forEach((_, i) => counts[i % 3]++);
    return moons.map((spec, i) => {
      const shell = i % 3;
      const k = perShell[shell]++;
      return { spec, shell, phase: (k / counts[shell]) * Math.PI * 2 + shell * 0.7, speed: 0.55 / Math.pow(SHELLS[shell].r, 1.5), color: hueColor(spec.hue), pos: new THREE.Vector3() };
    });
  }, [moons]);
  const icons = useMemo(() => moons.map((m) => iconTexture(m.icon, invalidate)), [moons, invalidate]);
  const matrices = useMemo(() => SHELLS.map((s) => new THREE.Matrix4().makeRotationFromEuler(s.tilt)), []);

  const orbitGeos = useMemo(
    () =>
      SHELLS.map((s, i) => {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 256; k++) pts.push(new THREE.Vector3(Math.cos((k / 256) * Math.PI * 2) * s.r, 0, Math.sin((k / 256) * Math.PI * 2) * s.r).applyMatrix4(matrices[i]));
        return new THREE.BufferGeometry().setFromPoints(pts);
      }),
    [matrices],
  );

  // Streams: one curved line and a few travelling packets per moon, rewritten every frame (a few thousand floats).
  const streams = useMemo(() => {
    const n = moons.length;
    const line = new THREE.BufferGeometry();
    line.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * SEGMENTS * 2 * 3), 3));
    line.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * SEGMENTS * 2 * 3), 3));
    const packets = new THREE.BufferGeometry();
    packets.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * PACKETS * 3), 3));
    packets.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * PACKETS * 3), 3));
    packets.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n * PACKETS).map(() => Math.random()), 1));
    line.boundingSphere = packets.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
    const packetMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uPixel: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uPixel; attribute vec3 aColor; attribute float aSeed; varying vec3 vColor; varying float vAlpha;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vColor = aColor; vAlpha = 1.0; gl_PointSize = uPixel * (5.0 + aSeed * 4.0) * (10.0 / -mv.z); }`,
      fragmentShader: POINT_FRAG,
    });
    return { line, packets, packetMat };
  }, [moons.length]);

  const moonRefs = useRef<(THREE.Group | null)[]>([]);
  const iconRefs = useRef<(THREE.Sprite | null)[]>([]);
  const label = useRef<THREE.Sprite>(null);
  const labelMap = useMemo(() => (hovered === null ? null : labelTexture(states[hovered].spec.name, states[hovered].spec.tagline, states[hovered].color)), [hovered, states]);
  useEffect(() => () => labelMap?.dispose(), [labelMap]);
  const dpr = useThree((s) => s.viewport.dpr);
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), p: new THREE.Vector3(), curve: new THREE.QuadraticBezierCurve3(), toCam: new THREE.Vector3() }), []);

  useFrame(() => {
    const t = time.current;
    const linePos = streams.line.getAttribute('position') as THREE.BufferAttribute;
    const lineCol = streams.line.getAttribute('color') as THREE.BufferAttribute;
    const pPos = streams.packets.getAttribute('position') as THREE.BufferAttribute;
    const pCol = streams.packets.getAttribute('aColor') as THREE.BufferAttribute;
    states.forEach((s, i) => {
      const a = s.phase + t * s.speed;
      const r = SHELLS[s.shell].r;
      s.pos.set(Math.cos(a) * r, Math.sin(a * 2 + i) * 0.08, Math.sin(a) * r).applyMatrix4(matrices[s.shell]);
      const g = moonRefs.current[i];
      if (g) {
        g.position.copy(s.pos);
        const target = hovered === i ? 1.55 : 1;
        g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, target, 0.15));
      }
      const icon = iconRefs.current[i];
      if (icon && g) {
        // Icons draw over their own bead; hide one while its moon passes behind the core.
        g.getWorldPosition(tmp.p);
        const toCore = tmp.toCam.copy(camera.position).negate();
        const coreDist = toCore.length();
        const moonDist = tmp.p.distanceTo(camera.position);
        toCore.normalize();
        const lateral = tmp.c.copy(tmp.p).cross(toCore).length();
        const hidden = moonDist > coreDist ? 1 - THREE.MathUtils.smoothstep(lateral, 1.25, 1.75) : 0;
        (icon.material as THREE.SpriteMaterial).opacity = 1 - hidden;
      }
      // Stream curve: moon → arc → core surface
      tmp.a.copy(s.pos);
      tmp.b.copy(s.pos).normalize().multiplyScalar(1.5);
      tmp.c.copy(tmp.a).add(tmp.b).multiplyScalar(0.5);
      tmp.c.y += 0.9 + (i % 3) * 0.25;
      tmp.curve.v0.copy(tmp.a);
      tmp.curve.v1.copy(tmp.c);
      tmp.curve.v2.copy(tmp.b);
      const bright = hovered === null ? 0.35 : hovered === i ? 1.6 : 0.12;
      for (let k = 0; k < SEGMENTS; k++) {
        const base = (i * SEGMENTS + k) * 2;
        for (let e = 0; e < 2; e++) {
          const u = (k + e) / SEGMENTS;
          tmp.curve.getPoint(u, tmp.p);
          linePos.setXYZ(base + e, tmp.p.x, tmp.p.y, tmp.p.z);
          const fade = Math.sin(u * Math.PI) * bright;
          lineCol.setXYZ(base + e, THREE.MathUtils.lerp(s.color.r, CYAN.r, u) * fade, THREE.MathUtils.lerp(s.color.g, CYAN.g, u) * fade, THREE.MathUtils.lerp(s.color.b, CYAN.b, u) * fade);
        }
      }
      for (let k = 0; k < PACKETS; k++) {
        const u = (t * (0.22 + (i % 5) * 0.03) + k / PACKETS + i * 0.137) % 1;
        // Alternate direction: data flows into the core and back out.
        tmp.curve.getPoint(k % 2 ? 1 - u : u, tmp.p);
        pPos.setXYZ(i * PACKETS + k, tmp.p.x, tmp.p.y, tmp.p.z);
        const f = (hovered === null || hovered === i ? 1.6 : 0.35) * Math.sin(u * Math.PI);
        pCol.setXYZ(i * PACKETS + k, (k % 2 ? CYAN.r : s.color.r) * f, (k % 2 ? CYAN.g : s.color.g) * f, (k % 2 ? CYAN.b : s.color.b) * f);
      }
    });
    linePos.needsUpdate = lineCol.needsUpdate = pPos.needsUpdate = pCol.needsUpdate = true;
    streams.packetMat.uniforms.uPixel.value = dpr;
    if (label.current && hovered !== null) label.current.position.copy(states[hovered].pos).add(tmp.p.set(0, 0.85, 0));
  });

  useEffect(() => () => {
    document.body.style.cursor = '';
    icons.forEach((t) => t.dispose());
    glow.dispose();
  }, [icons, glow]);

  const over = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    setHovered(i);
    document.body.style.cursor = 'pointer';
  };
  const out = () => {
    setHovered(null);
    document.body.style.cursor = '';
  };

  return (
    <group>
      {orbitGeos.map((g, i) => (
        <lineLoop key={i} geometry={g}><lineBasicMaterial color={i === 1 ? VIOLET : CYAN} transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} /></lineLoop>
      ))}
      <lineSegments geometry={streams.line}><lineBasicMaterial vertexColors transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} /></lineSegments>
      <points geometry={streams.packets} material={streams.packetMat} />
      {states.map((s, i) => (
        <group key={s.spec.id} ref={(el) => void (moonRefs.current[i] = el)}>
          <mesh onPointerOver={over(i)} onPointerOut={out} onClick={() => interactive && (window.location.href = '/app')}>
            <sphereGeometry args={[0.3, 48, 32]} />
            <meshPhysicalMaterial color={s.color.clone().lerp(new THREE.Color('#050912'), 0.72)} emissive={s.color} emissiveIntensity={0.32} roughness={0.22} metalness={0.2} clearcoat={1} clearcoatRoughness={0.08} iridescence={0.5} envMapIntensity={0.5} />
          </mesh>
          <sprite scale={[1.15, 1.15, 1]}>
            <spriteMaterial map={glow} color={s.color} transparent opacity={0.13} blending={THREE.AdditiveBlending} depthWrite={false} />
          </sprite>
          <sprite ref={(el) => void (iconRefs.current[i] = el)} scale={[0.38, 0.38, 1]} renderOrder={5}>
            <spriteMaterial map={icons[i]} transparent depthTest={false} depthWrite={false} toneMapped={false} color={new THREE.Color(0.92, 0.95, 1.0)} />
          </sprite>
        </group>
      ))}
      {labelMap && (
        <sprite ref={label} scale={[2.5, 0.69, 1]} renderOrder={10}>
          <spriteMaterial map={labelMap} transparent depthTest={false} depthWrite={false} toneMapped={false} color={new THREE.Color(0.82, 0.82, 0.82)} />
        </sprite>
      )}
    </group>
  );
}

// ── camera drift, post-processing, environment ───────────────────────────────────────────────────────

function Rig({ still, children }: { still: boolean; children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const pointer = useThree((s) => s.pointer);
  const intro = useRef(still ? 1 : 0);
  useFrame((_, dt) => {
    if (!group.current || still) return;
    // Unfold on arrival: the system grows out of the core over the first two seconds.
    if (intro.current < 1) {
      intro.current = Math.min(1, intro.current + Math.min(dt, 1 / 20) / 2.2);
      const e = 1 - Math.pow(1 - intro.current, 3);
      group.current.scale.setScalar(0.55 + 0.45 * e);
      group.current.rotation.y = (1 - e) * -0.9;
    }
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -pointer.y * 0.12, 0.04);
    group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, pointer.x * 0.06, 0.04);
  });
  return <group ref={group}>{children}</group>;
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.4; // a white studio is far brighter than deep space
    pmrem.dispose();
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Bloom({ strength }: { strength: number }) {
  const { gl, scene, camera, size } = useThree();
  const dpr = useThree((s) => s.viewport.dpr);
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), strength, 0.45, 1.0));
    c.addPass(new OutputPass());
    return c;
  }, [gl, scene, camera, strength]);
  useEffect(() => {
    composer.setPixelRatio(dpr);
    composer.setSize(size.width, size.height);
  }, [composer, size, dpr]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame((_, dt) => composer.render(dt), 1);
  return null;
}

function Ready({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  useFrame(() => {
    frames.current++;
    if (frames.current === 3) onReady();
    else if (frames.current < 3) invalidate(); // on-demand rendering (reduced motion) still reaches frame 3
  });
  return null;
}

function Scene({ moons, tier, still, interactive, bloom, onReady }: { moons: MoonSpec[]; tier: Tier; still: boolean; interactive: boolean; bloom: boolean; onReady: () => void }) {
  const time = useClock(still);
  return (
    <>
      <Environment />
      <ambientLight intensity={0.15} />
      <directionalLight position={[-6, 7, 8]} intensity={1.6} color="#e8f1ff" />
      <directionalLight position={[7, -2, -4]} intensity={0.7} color="#b48cff" />
      <Nebula time={time} octaves={tier.octaves} />
      <Stars count={tier.stars} time={time} />
      <Rig still={still}>
        <group rotation={[0.08, 0, 0]}>
          <Core tier={tier} time={time} />
          <Disc count={tier.disk} time={time} />
          <Moons moons={moons} time={time} interactive={interactive} />
        </group>
      </Rig>
      {bloom && <Bloom strength={tier.high ? 0.95 : 0.8} />}
      <Ready onReady={onReady} />
    </>
  );
}

export default function LifeCore({ moons, tier, still, active, onReady }: { moons: MoonSpec[]; tier: Tier; still: boolean; active: boolean; onReady: () => void }) {
  const [dpr, setDpr] = useState(tier.dpr[1]);
  const [bloom, setBloom] = useState(true);
  const fine = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
  return (
    <Canvas
      dpr={dpr}
      frameloop={!active ? 'never' : still ? 'demand' : 'always'}
      camera={{ position: [0, 3.0, 13.2], fov: 36, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.95 }}
      onCreated={({ gl }) => gl.setClearColor('#03050c')}
    >
      <PerformanceMonitor
        onDecline={() => {
          setDpr((d) => Math.max(tier.dpr[0], d - 0.25));
          if (dpr <= tier.dpr[0] + 0.01) setBloom(false);
        }}
        onIncline={() => setDpr((d) => Math.min(tier.dpr[1], d + 0.25))}
      />
      <Scene moons={moons} tier={tier} still={still} interactive={fine} bloom={bloom} onReady={onReady} />
      {fine && !still && <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.35} enableDamping dampingFactor={0.06} minPolarAngle={Math.PI * 0.28} maxPolarAngle={Math.PI * 0.62} />}
    </Canvas>
  );
}

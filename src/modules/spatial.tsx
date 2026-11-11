'use client';

import { Billboard, Line, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { navigate, openEditor } from '@/core/app';
import type { Rec } from '@/core/data/db';
import { useEnabledModules, useModules, useNow, usePrefs, useRecords } from '@/core/data/hooks';
import { titleOf } from '@/core/data/store';
import { relativeDay, ymd } from '@/core/lib/dates';
import { goalProgress } from '@/core/lib/goals';
import { byDate, isDue, periodProgress } from '@/core/lib/habits';
import { compareTasks, isDone, isDueToday, isOpen, isOverdue, type TaskLike } from '@/core/lib/tasks';
import type { ModuleProps } from '@/shell/Page';
import { layoutGraph, type GraphEdge, type GraphNode } from '@/ui/Graph';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Empty, IconButton, Progress, Segmented, cx, useMediaQuery } from '@/ui/kit';
import { wikiLinks } from '@/ui/Markdown';
import { toggleTask } from '@/ui/RecordEditor';

/**
 * Spatial mode: an orbitable 3D view of the same data the 2D modules show. Everything is procedural
 * geometry (no downloaded models or fonts), sized for phones: capped pixel ratio, low segment counts,
 * instancing for repeated meshes, on-demand rendering when motion is reduced, and a 2D fallback when
 * WebGL is unavailable. Every object is also listed in the side panel, so the scene is never the only
 * way to reach something.
 */

type View = 'overview' | 'tasks' | 'goals' | 'projects' | 'knowledge';
interface Quality { dpr: [number, number]; segments: number; stars: number }
interface Theme { text: string; muted: string; card: string; line: string; dark: boolean }

const hueColor = (oklchHue: number, l = 0.62) => new THREE.Color().setHSL((((oklchHue - 22) % 360) + 360) % 360 / 360, 0.78, l);
const CAMERA: Record<View, { pos: [number, number, number]; target: [number, number, number] }> = {
  overview: { pos: [0, 4.2, 16.5], target: [0, 0.9, 0] },
  tasks: { pos: [0, 2.4, 8.4], target: [0, 2.1, 2.2] },
  goals: { pos: [-8.6, 1.6, 6.8], target: [-7.4, 0.6, 0] },
  projects: { pos: [8.6, 1.8, 6.8], target: [7.4, 0.4, 0] },
  knowledge: { pos: [0, 2, 12], target: [0, 0, 0] },
};

// ── text as textures (no font downloads) ─────────────────────────────────────────────────────────

const textureCache = new Map<string, THREE.CanvasTexture>();
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/.{1,2}$/, '')}…`;
  return lines;
}
function labelTexture(text: string, color: string): THREE.CanvasTexture {
  const key = `l|${text}|${color}`;
  if (textureCache.has(key)) return textureCache.get(key)!;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '600 40px "Geist Variable", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  const t = text.length > 22 ? `${text.slice(0, 21)}…` : text;
  ctx.fillText(t, 256, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}
function cardTexture(title: string, meta: string, done: boolean, accent: string, theme: Theme): THREE.CanvasTexture {
  const key = `c|${title}|${meta}|${done}|${accent}|${theme.dark}`;
  if (textureCache.has(key)) return textureCache.get(key)!;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const r = 34;
  ctx.beginPath();
  ctx.roundRect(4, 4, 504, 248, r);
  ctx.fillStyle = theme.card;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = done ? '#34d399' : theme.line;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(4, 4, 14, 248, [r, 0, 0, r]);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(62, 70, 22, 0, Math.PI * 2);
  ctx.strokeStyle = done ? '#34d399' : theme.muted;
  ctx.lineWidth = 5;
  ctx.stroke();
  if (done) { ctx.fillStyle = '#34d399'; ctx.fill(); ctx.strokeStyle = theme.card; ctx.beginPath(); ctx.moveTo(51, 70); ctx.lineTo(59, 79); ctx.lineTo(74, 61); ctx.stroke(); }
  ctx.font = '600 36px "Geist Variable", system-ui, sans-serif';
  ctx.fillStyle = done ? theme.muted : theme.text;
  ctx.textBaseline = 'middle';
  wrap(ctx, title, 380, 3).forEach((line, i) => ctx.fillText(line, 104, 70 + i * 46));
  ctx.font = '500 28px "Geist Variable", system-ui, sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText(meta, 40, 216);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textureCache.set(key, tex);
  return tex;
}
function glowTexture(): THREE.CanvasTexture {
  if (textureCache.has('glow')) return textureCache.get('glow')!;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  textureCache.set('glow', tex);
  return tex;
}

function Label({ text, color, position, scale = 1 }: { text: string; color: string; position: [number, number, number]; scale?: number }) {
  const map = useMemo(() => labelTexture(text, color), [text, color]);
  return <sprite position={position} scale={[2.6 * scale, 0.49 * scale, 1]}><spriteMaterial map={map} transparent depthWrite={false} /></sprite>;
}
function Glow({ color, scale, opacity = 0.5 }: { color: THREE.ColorRepresentation; scale: number; opacity?: number }) {
  const map = useMemo(() => glowTexture(), []);
  return <sprite scale={[scale, scale, 1]}><spriteMaterial map={map} color={color} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>;
}

// ── scene pieces ─────────────────────────────────────────────────────────────────────────────────

function Hover({ children, onClick, label, scale = 1.12 }: { children: ReactNode; onClick: () => void; label: string; scale?: number }) {
  const ref = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const { invalidate } = useThree();
  useFrame(() => {
    if (!ref.current) return;
    const target = hover ? scale : 1;
    const s = ref.current.scale.x + (target - ref.current.scale.x) * 0.2;
    if (Math.abs(s - ref.current.scale.x) > 0.001) { ref.current.scale.setScalar(s); invalidate(); }
  });
  useEffect(() => { document.body.style.cursor = hover ? 'pointer' : ''; return () => { document.body.style.cursor = ''; }; }, [hover]);
  return (
    <group ref={ref} userData={{ label }} onClick={(e) => { e.stopPropagation(); onClick(); }} onPointerOver={(e) => { e.stopPropagation(); setHover(true); }} onPointerOut={() => setHover(false)}>
      {children}
    </group>
  );
}

function Core({ ratio, q, animate, accent }: { ratio: number; q: Quality; animate: boolean; accent: THREE.Color }) {
  const shell = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (!animate) return;
    if (shell.current) { shell.current.rotation.y += dt * 0.25; shell.current.rotation.x += dt * 0.08; }
    if (ring.current) ring.current.rotation.z -= dt * 0.15;
  });
  const fill = 0.35 + ratio * 0.75;
  return (
    <group>
      <Glow color={accent} scale={5.5 + ratio * 2} opacity={0.35 + ratio * 0.3} />
      <mesh ref={shell}><icosahedronGeometry args={[1.25, 1]} /><meshStandardMaterial color={accent} wireframe transparent opacity={0.55} /></mesh>
      <mesh scale={fill}><sphereGeometry args={[1, q.segments, q.segments]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6 + ratio} roughness={0.35} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.75, 0.025, 8, 96]} /><meshBasicMaterial color="#64748b" transparent opacity={0.35} /></mesh>
      {ratio > 0 && <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.75, 0.07, 10, 96, Math.PI * 2 * Math.min(1, ratio)]} /><meshBasicMaterial color={accent} /></mesh>}
    </group>
  );
}

function ModuleOrbit({ modules, q, animate, theme }: { modules: { id: string; name: string; hue: number }[]; q: Quality; animate: boolean; theme: Theme }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (animate && group.current) group.current.rotation.y += dt * 0.045; });
  const radius = 4.4;
  return (
    <group ref={group} rotation={[0.12, 0, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[radius, 0.012, 6, 128]} /><meshBasicMaterial color="#64748b" transparent opacity={0.25} /></mesh>
      {modules.map((m, i) => {
        const a = (i / modules.length) * Math.PI * 2;
        const color = hueColor(m.hue);
        return (
          <group key={m.id} position={[Math.cos(a) * radius, Math.sin(a * 2) * 0.25, Math.sin(a) * radius]}>
            <Hover label={m.name} onClick={() => navigate(`/${m.id}`)} scale={1.3}>
              <Glow color={color} scale={1.5} opacity={0.4} />
              <mesh><sphereGeometry args={[0.28, q.segments, q.segments]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} roughness={0.4} /></mesh>
            </Hover>
            <Billboard><Label text={m.name} color={theme.text} position={[0, -0.55, 0]} scale={0.62} /></Billboard>
          </group>
        );
      })}
    </group>
  );
}

function TaskCards({ tasks, theme, animate }: { tasks: Rec[]; theme: Theme; animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (animate && group.current) group.current.children.forEach((c, i) => (c.position.y = (c.userData.baseY as number) + Math.sin(clock.elapsedTime * 0.6 + i * 1.3) * 0.06)); });
  const cols = Math.min(4, Math.max(1, tasks.length));
  return (
    <group ref={group} position={[0, 1.55, 2.2]}>
      {tasks.map((t, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const count = Math.min(cols, tasks.length - row * cols);
        const x = (col - (count - 1) / 2) * 1.75;
        const y = 1.25 - row * 1.0;
        const overdue = isOverdue(t as TaskLike);
        const accent = isDone(t as TaskLike) ? '#34d399' : overdue ? '#fb7185' : (t.priority ?? 0) >= 3 ? '#fbbf24' : '#38bdf8';
        const meta = isDone(t as TaskLike) ? 'Done' : t.dueAt ? relativeDay(t.dueAt) : 'No date';
        return (
          <group key={t.id} position={[x, y, Math.abs(x) * -0.18]} rotation={[0, -x * 0.08, 0]} userData={{ baseY: y }}>
            <Hover label={`Task: ${titleOf(t)}`} onClick={() => void toggleTask(t)} scale={1.08}>
              <mesh><planeGeometry args={[1.6, 0.8]} /><meshBasicMaterial map={cardTexture(titleOf(t), meta, isDone(t as TaskLike), accent, theme)} transparent side={THREE.DoubleSide} /></mesh>
            </Hover>
          </group>
        );
      })}
    </group>
  );
}

function GoalRings({ goals, theme }: { goals: { rec: Rec; progress: number }[]; theme: Theme }) {
  return (
    <group position={[-7.4, 0.4, 0]}>
      {goals.map((g, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const color = g.progress >= 1 ? '#34d399' : '#fbbf24';
        return (
          <group key={g.rec.id} position={[(col - 0.5) * 2.5, 1.6 - row * 2.0, col * -0.6]}>
            <Hover label={`Goal: ${titleOf(g.rec)}`} onClick={() => openEditor('goals', g.rec.id)}>
              <mesh><torusGeometry args={[0.62, 0.035, 8, 64]} /><meshBasicMaterial color="#64748b" transparent opacity={0.4} /></mesh>
              {g.progress > 0 && <mesh rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.62, 0.085, 10, 64, Math.PI * 2 * Math.min(1, g.progress)]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} /></mesh>}
              <mesh><circleGeometry args={[0.5, 32]} /><meshBasicMaterial color={theme.card} transparent opacity={0.55} /></mesh>
              <Label text={`${Math.round(g.progress * 100)}%`} color={theme.text} position={[0, 0, 0.02]} scale={0.6} />
            </Hover>
            <Label text={titleOf(g.rec)} color={theme.muted} position={[0, -0.95, 0]} scale={0.62} />
          </group>
        );
      })}
    </group>
  );
}

function ProjectClusters({ projects, q, theme, animate }: { projects: { rec: Rec; open: number; progress: number }[]; q: Quality; theme: Theme; animate: boolean }) {
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const place = (mesh: THREE.InstancedMesh, count: number, t: number) => {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + t * 0.35;
      dummy.position.set(Math.cos(a) * 0.95, Math.sin(a * 1.7 + k) * 0.22, Math.sin(a) * 0.95);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  useEffect(() => { refs.current.forEach((m, i) => m && place(m, Math.min(12, projects[i]?.open ?? 0), 0)); }); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ clock }) => { if (animate) refs.current.forEach((m, i) => m && place(m, Math.min(12, projects[i]?.open ?? 0), clock.elapsedTime)); });
  return (
    <group position={[7.4, 0.4, 0]}>
      {projects.map((p, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const color = new THREE.Color((p.rec.color as string) ?? '#a78bfa');
        const sats = Math.min(12, p.open);
        return (
          <group key={p.rec.id} position={[(col - 0.5) * 2.9, 1.6 - row * 2.1, col * -0.6]}>
            <Hover label={`Project: ${titleOf(p.rec)}`} onClick={() => navigate(`/projects/${p.rec.id}`)}>
              <Glow color={color} scale={2.2} opacity={0.3} />
              <mesh><sphereGeometry args={[0.42, q.segments, q.segments]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25 + p.progress * 0.5} roughness={0.45} /></mesh>
            </Hover>
            {sats > 0 && <instancedMesh ref={(m) => { refs.current[i] = m; }} args={[undefined, undefined, sats]}><sphereGeometry args={[0.075, 8, 8]} /><meshBasicMaterial color={color} /></instancedMesh>}
            <Label text={titleOf(p.rec)} color={theme.text} position={[0, -1.05, 0]} scale={0.66} />
            <Label text={`${Math.round(p.progress * 100)}% · ${p.open} open`} color={theme.muted} position={[0, -1.36, 0]} scale={0.5} />
          </group>
        );
      })}
    </group>
  );
}

function KnowledgeGraph3D({ nodes, edges, q, theme }: { nodes: GraphNode[]; edges: GraphEdge[]; q: Quality; theme: Theme }) {
  const pos = useMemo(() => { const p = layoutGraph(nodes, edges, 3, 180); for (const v of p.values()) { v[0] /= 22; v[1] /= 22; v[2] /= 9; } return p; }, [nodes, edges]);
  return (
    <group>
      {edges.map((e, i) => { const a = pos.get(e.from); const b = pos.get(e.to); return a && b ? <Line key={i} points={[a, b]} color={theme.dark ? '#64748b' : '#94a3b8'} lineWidth={1} transparent opacity={0.55} /> : null; })}
      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        const r = 0.13 + Math.min(0.2, (n.weight ?? 1) * 0.03);
        return (
          <group key={n.id} position={p}>
            <Hover label={`Note: ${n.label}`} onClick={() => navigate(`/notes/${n.id}`)} scale={1.4}>
              <Glow color="#22d3ee" scale={r * 6} opacity={0.35} />
              <mesh><sphereGeometry args={[r, Math.min(16, q.segments), Math.min(16, q.segments)]} /><meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.5} /></mesh>
            </Hover>
            <Billboard><Label text={n.label} color={theme.text} position={[0, -r - 0.28, 0]} scale={0.5} /></Billboard>
          </group>
        );
      })}
    </group>
  );
}

function Stars({ count, dark }: { count: number; dark: boolean }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const r = 22 + rand() * 30;
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      positions.set([r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <points geometry={geometry}><pointsMaterial size={0.09} color={dark ? '#cbd5e1' : '#64748b'} transparent opacity={dark ? 0.7 : 0.45} sizeAttenuation depthWrite={false} /></points>;
}

/** Moves the camera to the preset for the active view, then hands control back to the user. */
function Rig({ view, shift }: { view: View; shift: number }) {
  const { camera, invalidate } = useThree();
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const moving = useRef(true);
  const goal = useMemo(() => ({ pos: new THREE.Vector3(...CAMERA[view].pos).add(new THREE.Vector3(shift, 0, 0)), target: new THREE.Vector3(...CAMERA[view].target).add(new THREE.Vector3(shift, 0, 0)) }), [view, shift]);
  useEffect(() => { moving.current = true; invalidate(); }, [goal, invalidate]);
  useFrame(() => {
    if (!moving.current || !controls.current) return;
    camera.position.lerp(goal.pos, 0.09);
    controls.current.target.lerp(goal.target, 0.09);
    controls.current.update();
    if (camera.position.distanceTo(goal.pos) < 0.04) moving.current = false;
    invalidate();
  });
  return <OrbitControls ref={controls} enableDamping dampingFactor={0.08} enablePan={false} minDistance={3.5} maxDistance={24} maxPolarAngle={Math.PI * 0.62} onStart={() => (moving.current = false)} makeDefault />;
}

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

// ── module ───────────────────────────────────────────────────────────────────────────────────────

export default function Spatial(_: ModuleProps) {
  const [prefs, setPrefs] = usePrefs();
  const now = useNow();
  const enabled = useEnabledModules();
  const modules = useModules();
  const tasks = useRecords('tasks');
  const goals = useRecords('goals');
  const milestones = useRecords('milestones');
  const projects = useRecords('projects');
  const notes = useRecords('notes');
  const habits = useRecords('habits');
  const logs = useRecords('habitLogs');
  const coarse = useMediaQuery('(pointer: coarse)');
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)') || prefs.motion === 'reduced';
  const [view, setView] = useState<View>('overview');
  const [panel, setPanel] = useState(true);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [dprCap, setDprCap] = useState<number | null>(null);
  const [themeKey, setThemeKey] = useState('dark');
  useEffect(() => setSupported(webglAvailable()), []);
  useEffect(() => { setPanel(!coarse); }, [coarse]);
  useEffect(() => {
    const read = () => setThemeKey(document.documentElement.dataset.theme ?? 'dark');
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  const theme: Theme = themeKey === 'light' ? { text: '#12151d', muted: '#535c6e', card: '#ffffff', line: '#cbd5e1', dark: false } : { text: '#eceef4', muted: '#9aa2b4', card: '#151821', line: '#3b4252', dark: true };
  const low = prefs.spatialQuality === 'low' || (prefs.spatialQuality === 'auto' && (coarse || ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8) <= 4));
  const q: Quality = low ? { dpr: [1, 1.25], segments: 16, stars: 260 } : { dpr: [1, 2], segments: 28, stars: 1100 };
  const accent = useMemo(() => hueColor(prefs.accentHue, 0.6), [prefs.accentHue]);

  const todayTasks = useMemo(() => {
    const today = ymd(now);
    const open = tasks.filter((t) => isOpen(t as TaskLike) && !t.parentId);
    const focus = open.filter((t) => isDueToday(t as TaskLike, now) || isOverdue(t as TaskLike, now) || (t.priority ?? 0) >= 2).sort(compareTasks);
    const doneToday = tasks.filter((t) => t.completedAt && ymd(new Date(t.completedAt)) === today && !t.parentId);
    const list = [...(focus.length ? focus : open.sort(compareTasks)).slice(0, 8 - Math.min(2, doneToday.length)), ...doneToday.slice(0, 2)].slice(0, 8);
    const dueHabits = habits.filter((h) => !h.archived && isDue(h, now));
    const habitsDone = dueHabits.filter((h) => periodProgress(h, byDate(logs, h.id), now).met).length;
    const total = focus.length + doneToday.length + dueHabits.length;
    return { list, ratio: total ? (doneToday.length + habitsDone) / total : 0, done: doneToday.length + habitsDone, total };
  }, [tasks, habits, logs, now]);
  const goalList = useMemo(() => goals.filter((g) => g.status === 'active' && !g.archived && g.kind !== 'keyResult').slice(0, 6).map((rec) => ({ rec, progress: goalProgress(rec, goals, milestones, tasks) })), [goals, milestones, tasks]);
  const projectList = useMemo(() => projects.filter((p) => !p.archived && p.status !== 'done').slice(0, 6).map((rec) => { const mine = tasks.filter((t) => t.projectId === rec.id && !t.archived); return { rec, open: mine.filter((t) => t.status !== 'done').length, progress: mine.length ? mine.filter((t) => t.status === 'done').length / mine.length : 0 }; }), [projects, tasks]);
  const graph = useMemo(() => {
    const live = notes.filter((n) => !n.archived).sort((a, b) => b._ua - a._ua).slice(0, low ? 40 : 90);
    const byTitle = new Map(live.map((n) => [String(n.title ?? '').trim().toLowerCase(), n]));
    const edges: GraphEdge[] = [];
    for (const n of live) for (const t of wikiLinks(n.content)) { const target = byTitle.get(t.toLowerCase()); if (target && target.id !== n.id) edges.push({ from: n.id, to: target.id }); }
    const nodes: GraphNode[] = live.map((n) => ({ id: n.id, label: String(n.title || 'Untitled'), weight: 1 + edges.filter((e) => e.from === n.id || e.to === n.id).length }));
    return { nodes, edges };
  }, [notes, low]);
  const orbit = modules.filter((m) => m.enabled && !['home', 'spatial', 'settings', 'marketplace'].includes(m.def.id)).slice(0, low ? 12 : 20).map((m) => ({ id: m.def.id, name: m.def.name, hue: m.def.hue }));

  const views: { value: View; label: string; icon: IconName; module?: string }[] = [{ value: 'overview', label: 'Overview', icon: 'orbit' }, { value: 'tasks', label: 'Tasks', icon: 'tasks', module: 'tasks' }, { value: 'goals', label: 'Goals', icon: 'target', module: 'goals' }, { value: 'projects', label: 'Projects', icon: 'projects', module: 'projects' }, { value: 'knowledge', label: 'Knowledge', icon: 'network', module: 'notes' }];
  const available = views.filter((v) => !v.module || enabled.has(v.module));
  const show = (v: View) => view === 'overview' ? v !== 'knowledge' : view === v;

  const listPanel = (
    <div className="space-y-4 text-sm">
      {(view === 'overview' || view === 'tasks') && enabled.has('tasks') && (
        <section><h3 className="eyebrow mb-1">Today · {todayTasks.done}/{todayTasks.total}</h3><Progress value={todayTasks.ratio} label="Today's progress" className="mb-1.5" />
          {todayTasks.list.length === 0 ? <p className="text-faint">No tasks for today.</p> : todayTasks.list.map((t) => <button key={t.id} type="button" className="row w-full !min-h-9 !px-1.5 text-left" onClick={() => void toggleTask(t)}><Icon name={isDone(t as TaskLike) ? 'checkCircle' : 'circle'} size={15} className={isDone(t as TaskLike) ? 'flex-none text-good' : 'flex-none text-faint'} /><span className={cx('min-w-0 flex-1 truncate', isDone(t as TaskLike) && 'text-faint line-through')}>{titleOf(t)}</span></button>)}</section>
      )}
      {(view === 'overview' || view === 'goals') && enabled.has('goals') && goalList.length > 0 && <section><h3 className="eyebrow mb-1">Goals</h3>{goalList.map((g) => <button key={g.rec.id} type="button" className="row w-full !min-h-9 !px-1.5 text-left" onClick={() => openEditor('goals', g.rec.id)}><span className="min-w-0 flex-1 truncate">{titleOf(g.rec)}</span><span className="num text-xs text-muted">{Math.round(g.progress * 100)}%</span></button>)}</section>}
      {(view === 'overview' || view === 'projects') && enabled.has('projects') && projectList.length > 0 && <section><h3 className="eyebrow mb-1">Projects</h3>{projectList.map((p) => <button key={p.rec.id} type="button" className="row w-full !min-h-9 !px-1.5 text-left" onClick={() => navigate(`/projects/${p.rec.id}`)}><span className="size-2 flex-none rounded-full" style={{ background: (p.rec.color as string) ?? '#a78bfa' }} /><span className="min-w-0 flex-1 truncate">{titleOf(p.rec)}</span><span className="text-xs text-muted">{p.open} open</span></button>)}</section>}
      {view === 'knowledge' && <section><h3 className="eyebrow mb-1">{graph.nodes.length} notes · {graph.edges.length} links</h3>{graph.nodes.slice(0, 14).map((n) => <button key={n.id} type="button" className="row w-full !min-h-9 !px-1.5 text-left" onClick={() => navigate(`/notes/${n.id}`)}><Icon name="notes" size={14} className="flex-none text-muted" /><span className="min-w-0 flex-1 truncate">{n.label}</span></button>)}{graph.nodes.length === 0 && <p className="text-faint">Write notes and link them with [[Title]] to grow the graph.</p>}</section>}
      {view === 'overview' && <section><h3 className="eyebrow mb-1">Modules in orbit</h3><div className="flex flex-wrap gap-1.5">{orbit.map((m) => <button key={m.id} type="button" className="chip hover:border-accent" onClick={() => navigate(`/${m.id}`)}>{m.name}</button>)}</div></section>}
    </div>
  );

  const fallback = (
    <div className="mx-auto max-w-3xl p-6">
      <Empty icon="orbit" title="3D is not available on this device" hint="Your browser could not start WebGL, so here is the same overview in 2D. Everything else in LIFEOS works as usual." action={<Button onClick={() => { setPrefs({ mode: 'standard' }); navigate('/'); }}>Back to Standard mode</Button>} />
      <div className="card mt-4" data-testid="spatial-fallback">{listPanel}</div>
    </div>
  );

  if (supported === null) return <div className="grid h-[60dvh] place-items-center text-sm text-faint">Preparing the workspace…</div>;
  if (!supported) return fallback;

  return (
    <div className="relative h-[calc(100dvh-57px-62px-env(safe-area-inset-bottom))] min-h-[420px] w-full overflow-hidden md:h-[calc(100dvh-57px)]" data-testid="spatial-root">
      <SceneBoundary fallback={fallback}>
        <Canvas
          dpr={dprCap ? [1, dprCap] : q.dpr} frameloop={reduced ? 'demand' : 'always'} camera={{ position: CAMERA.overview.pos, fov: 50, near: 0.1, far: 120 }}
          gl={{ antialias: !low, alpha: true, powerPreference: low ? 'low-power' : 'high-performance' }} aria-label="Three-dimensional workspace. Use the panel to reach the same items with the keyboard." role="img"
        >
          <PerformanceMonitor onDecline={() => setDprCap(1)} />
          <ambientLight intensity={theme.dark ? 0.75 : 1.2} />
          <pointLight position={[0, 0, 0]} intensity={30} color={accent} distance={18} />
          <directionalLight position={[6, 9, 8]} intensity={theme.dark ? 1.3 : 1.8} />
          <Stars count={q.stars} dark={theme.dark} />
          <Rig view={view} shift={panel && !coarse ? (view === 'overview' || view === 'knowledge' ? 2.6 : 1.4) : 0} />
          {view !== 'knowledge' && (
            <>
              <Core ratio={todayTasks.ratio} q={q} animate={!reduced} accent={accent} />
              {view === 'overview' && <ModuleOrbit modules={orbit} q={q} animate={!reduced} theme={theme} />}
              {show('tasks') && enabled.has('tasks') && <TaskCards tasks={todayTasks.list} theme={theme} animate={!reduced} />}
              {show('goals') && enabled.has('goals') && <GoalRings goals={goalList} theme={theme} />}
              {show('projects') && enabled.has('projects') && <ProjectClusters projects={projectList} q={q} theme={theme} animate={!reduced} />}
            </>
          )}
          {view === 'knowledge' && <KnowledgeGraph3D nodes={graph.nodes} edges={graph.edges} q={q} theme={theme} />}
        </Canvas>
      </SceneBoundary>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start gap-2 p-3">
        <div className="pointer-events-auto max-w-full"><Segmented label="Spatial view" value={view} onChange={setView} options={available.map((v) => ({ value: v.value, label: v.label, icon: v.icon }))} /></div>
        <span className="flex-1" />
        <div className="pointer-events-auto flex gap-1.5">
          <Button size="sm" icon="dashboard" onClick={() => { setPrefs({ mode: 'standard' }); navigate('/'); }}>Standard mode</Button>
          <IconButton icon="panelRight" label={panel ? 'Hide list' : 'Show list'} active={panel} className="glass !rounded-[10px]" onClick={() => setPanel(!panel)} />
        </div>
      </div>
      {panel && <aside className="glass absolute bottom-3 right-3 top-[62px] w-[270px] overflow-y-auto p-3 max-md:inset-x-3 max-md:top-auto max-md:max-h-[42%] max-md:w-auto" aria-label="Items in this view">{listPanel}</aside>}
      <p className="pointer-events-none absolute bottom-3 left-3 max-w-[60%] text-xs text-faint max-md:hidden">Drag to orbit · scroll to zoom · select a card to complete it, a planet to open a module</p>
    </div>
  );
}

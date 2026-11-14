import type { CSSProperties } from 'react';
import { MODULES, featureCounts } from '@/core/registry';
import { Logo } from '@/shell/AuthScreen';
import { Icon } from '@/ui/icons';

const PILLARS = [
  { icon: 'cloudOff', title: 'Offline first', text: 'Everything is stored on your device. Planes, basements and bad Wi-Fi do not stop you.' },
  { icon: 'refresh', title: 'Synced across devices', text: 'Sign in and your phone, tablet and PC stay in step — merged field by field, with conflicts shown, never hidden.' },
  { icon: 'puzzle', title: 'Modular', text: 'Switch on only what you need. Add custom fields, categories, dashboards and automations as your life changes.' },
  { icon: 'orbit', title: 'Standard and Spatial', text: 'A fast 2D workspace for getting things done, and a 3D view of your tasks, goals, projects and notes.' },
  { icon: 'shield', title: 'Yours', text: 'No ads, no trackers, no third-party requests. Export everything as open JSON or delete it whenever you like.' },
  { icon: 'phone', title: 'Installable', text: 'Install it like an app on Android, Windows, macOS and iOS. One codebase, first-class on every screen.' },
];

export default function Landing() {
  const counts = featureCounts();
  const modules = MODULES.filter((m) => !m.core);
  return (
    <main className="app-canvas min-h-dvh">
      <header className="sticky top-0 z-30 mx-auto w-full max-w-6xl px-3 pt-3">
        <div className="glass-chrome flex items-center gap-3 !rounded-[20px] px-4 py-2.5">
        <Logo size={34} />
        <span className="font-display text-lg font-semibold tracking-wide">LIFEOS</span>
        <span className="flex-1" />
        <a href="/app" className="btn btn-primary">Open LIFEOS</a>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-16 pt-10 md:grid-cols-[1.1fr_0.9fr] md:pt-20">
        <div>
          <p className="eyebrow">The personal operating system</p>
          <h1 className="mt-3 text-[2.6rem] font-semibold leading-[1.05] sm:text-6xl">
            Everything in your life.
            <br />
            <span className="bg-gradient-to-r from-cyan via-blue to-violet bg-clip-text text-transparent">One intelligent workspace.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Tasks, calendar, projects, notes, habits, goals, money, learning, health, travel and more — {modules.length} modules that share one search, one capture button and one set of data, on every device you own.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="/app" className="btn btn-primary !min-h-12 !px-6 text-base">Get started — it is free</a>
            <a href="#modules" className="btn !min-h-12 !px-6 text-base">See what is inside</a>
          </div>
          <p className="mt-3 text-sm text-faint">No account needed to try it: start on this device, create an account later and keep your data.</p>
        </div>
        <div className="relative mx-auto aspect-square w-full max-w-[420px]" aria-hidden="true">
          <div className="glass absolute inset-[8%] !rounded-full" />
          <div className="glass absolute inset-[24%] !rounded-full" />
          <div className="absolute inset-[38%] rounded-full bg-gradient-to-br from-cyan to-violet opacity-90 blur-[2px]" />
          <div className="absolute inset-[30%] rounded-full bg-accent opacity-20 blur-2xl" />
          {modules.slice(0, 12).map((m, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const r = i % 2 ? 42 : 26;
            return (
              <span key={m.id} className="tile absolute size-11 -translate-x-1/2 -translate-y-1/2 backdrop-blur-md" style={{ left: `${50 + Math.cos(angle) * r}%`, top: `${50 + Math.sin(angle) * r}%`, "--mh": m.hue } as CSSProperties}>
                <Icon name={m.icon} size={20} />
              </span>
            );
          })}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-14">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[[String(MODULES.length), 'modules'], [String(counts.implemented), 'working capabilities'], ['100%', 'usable offline'], ['0', 'third-party trackers']].map(([n, label]) => (
            <div key={label} className="glass px-4 py-4"><div className="num text-3xl font-semibold">{n}</div><div className="text-sm text-muted">{label}</div></div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-16">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="card">
              <span className="tile size-10 !rounded-xl"><Icon name={p.icon} size={19} /></span>
              <h2 className="mt-3 text-lg font-semibold">{p.title}</h2>
              <p className="mt-1 text-sm text-muted">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="modules" className="mx-auto w-full max-w-6xl scroll-mt-6 px-5 pb-20">
        <h2 className="text-3xl font-semibold">A module for each part of life</h2>
        <p className="mt-2 max-w-2xl text-muted">Every capability is listed in the in-app Marketplace with an honest status: {counts.implemented} implemented, {counts.partial} partial, {counts.integration} waiting on an integration and {counts.planned} planned.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <div key={m.id} className="card card-hover">
              <div className="flex items-center gap-3">
                <span className="tile size-10 !rounded-xl" style={{ '--mh': m.hue } as CSSProperties}><Icon name={m.icon} size={19} /></span>
                <div className="min-w-0"><h3 className="truncate font-sans font-semibold tracking-normal">{m.name}</h3><p className="truncate text-sm text-muted">{m.tagline}</p></div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-faint">{m.features.filter((f) => f.status === 'implemented').slice(0, 5).map((f) => f.name).join(' · ')}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <a href="/app" className="btn btn-primary !min-h-12 !px-8 text-base">Open LIFEOS</a>
          <p className="text-sm text-faint">Works in any modern browser. Install it from the browser menu for the full app experience.</p>
        </div>
      </section>
    </main>
  );
}

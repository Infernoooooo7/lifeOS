# LIFEOS — build progress

Working notes so the build can resume if interrupted. Newest state at the top of each section.

## Decisions (stable)
- Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Motion · three / R3F / drei · Zustand · TanStack Query · Dexie (IndexedDB) · Prisma 7 + PostgreSQL.
- Local-first: every read/write hits IndexedDB; `/api/sync` replicates with field-level 3-way merge (`src/core/sync/merge.ts`).
- The app shell is one client-rendered catch-all route (`/app/[[...path]]`) with History-API navigation, so it works offline from the service-worker cache.
- Auth is first-party: scrypt password hashes, hashed session tokens in Postgres, httpOnly SameSite=Lax cookie, recovery code + optional e-mail reset.
- Server tables: typed relational tables for core entities + `records` document table for long-tail collections (`src/server/sync/models.ts`).

## Checklist
- [x] A. Research + architecture decisions
- [x] C. Database schema, migration, auth API, sync API, API integration tests (23 passing)
- [x] Client data layer (Dexie store, sync client, hooks) + unit tests (unit + API + two-device tests passing)
- [x] B1. Design tokens (globals.css), UI kit (src/ui), feature registry (src/core/registry.ts), collection defs (src/core/collections.ts)
- [x] Collection engine: src/ui/CollectionView.tsx, RecordEditor.tsx, fields.tsx, MonthGrid.tsx
- [x] B2. App shell (src/shell/*): boot + auth gate, sidebar, top bar, mobile nav, launcher, context panel, onboarding, palette, capture, notifications
- [x] Modules done: all except spatial (home, tasks, calendar, projects, notes, habits, goals, finance, learning, health, journal, focus, lifestyle x6, utilities, automation, insights, marketplace, settings)
- [x] Spatial 3D module, service worker (src/app/sw.js/route.ts), icons, landing page, visual tour (scripts/dev/tour.mjs)
- [x] E2E suites written: tests/e2e/{workflows,layout,sync,pwa,spatial}.spec.ts (run: npm run build && npm run test:e2e)
- [x] Full e2e green on desktop + phone (52), unit/API green (98); registry honesty pass done; FEATURES.md generated; LICENSES.md generated
- [ ] NEXT: deploy on Render (free web service + free Postgres, branch ccr-b33f1d63-qjl2lu, region singapore; build `npm ci --include=dev && npm run build`, start `npx prisma migrate deploy && npx next start`), verify live; then write README, RESEARCH, ARCHITECTURE, TESTING, DEPLOYMENT, ROADMAP.
- [ ] Marketplace module UI
- [ ] D. Core modules: dashboard, tasks, calendar, projects, notes, habits, finance, goals
- [ ] E. Extended modules: learning, health, journal, focus, shopping, travel, files, entertainment, digital life, admin, utilities, automation, insights
- [ ] F. Marketplace, onboarding, settings/personalization, backup/import/export
- [ ] Search, command palette, quick capture, notification center
- [ ] G. Spatial 3D workspace
- [ ] H. PWA: manifest, service worker, icons, offline, update prompt
- [ ] I. E2E tests (desktop + mobile), accessibility/overflow checks, security review
- [ ] J. Deployment + live verification
- [ ] Docs: README, RESEARCH, ARCHITECTURE, FEATURES (generated), TESTING, LICENSES, ROADMAP, DEPLOYMENT
- [ ] Final honesty pass over feature statuses in the registry

## Resume notes
- Local dev DB: Postgres 16 on 127.0.0.1:5433 (data in /var/lib/lifeos-pg, start with pg_ctl as user postgres); `.env` points at it.
- Run `npx vitest run` (unit + API) and `npx tsc --noEmit` before each commit.
- Module components live in src/modules/<id>.tsx and are lazy-loaded from src/shell/modules.ts (not written yet).
- Registry statuses must be re-verified against the built modules before release.

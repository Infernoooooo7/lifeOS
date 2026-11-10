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
- [ ] Client data layer (Dexie store, sync client, hooks) + unit tests
- [ ] B. Design system, UI kit, app shell (desktop + mobile), router
- [ ] Feature registry + marketplace
- [ ] Collection engine (generic list/table/board/calendar/gallery + forms + custom fields)
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

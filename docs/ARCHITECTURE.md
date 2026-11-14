# LIFEOS architecture

LIFEOS is a **modular monolith**: one Next.js application, one PostgreSQL database, and a client that is
local-first. This document explains how the pieces fit and where to make changes.

```
 Browser (phone / tablet / PC)                                   Server (Next.js on Node)
┌───────────────────────────────────────────────┐              ┌─────────────────────────────────┐
│ React shell  ── modules (lazy chunks)         │              │ /api/[...path]  → server/api     │
│      │                                        │   HTTPS      │    auth.ts   sessions, reset     │
│ core/data  store ─ hooks (live queries)       │◄────────────►│    sync      push + pull         │
│      │                                        │  /api/sync   │    export    account export      │
│ IndexedDB (Dexie)  records · meta · blobs     │              │ server/sync  engine + models     │
│      │                                        │              │        │                         │
│ service worker  app shell + chunks cached     │              │ Prisma 7 ── PostgreSQL           │
└───────────────────────────────────────────────┘              └─────────────────────────────────┘
```

## 1. Repository layout

| Path | What lives there |
| --- | --- |
| `src/app` | Next.js routes: landing page, `/app/[[...path]]` (the whole product), `/reset`, `/api/[...path]`, manifest, generated service worker |
| `src/core` | Framework-free logic. `registry.ts` (features), `collections.ts` (record definitions), `data/` (IndexedDB store, sync client, hooks), `sync/` (merge + protocol shared with the server), `lib/` (recurrence, finance, habits, tasks, FSRS, automation, reminders, backup, search, utilities) |
| `src/server` | Database client, crypto, HTTP helpers, rate limiting, auth, the API router and the sync engine |
| `src/ui` | Design-system kit, field controls, the record editor, the generic collection view, charts, graph, timeline, Markdown |
| `src/shell` | App boot, auth screen, sidebar / top bar / tab bar, command palette, quick capture, notification centre, background engines |
| `src/modules` | One file per module, each a lazily loaded chunk |
| `prisma` | Schema, migrations, feature seed |
| `tests` | `unit/` (pure logic), `api/` (API + sync against PostgreSQL), `e2e/` (Playwright) |

## 2. Feature registry and modules

`src/core/registry.ts` is the single source of truth for what the product contains. Every capability has a stable id
(`tasks.recurring`), a module, an implementation status and optional dependencies. From this file the app derives the
sidebar, the Marketplace, onboarding recommendations, the landing-page figures, `docs/FEATURES.md`
(`npm run docs:features`) and the `features` database table (`npm run db:seed`). A unit test fails if a capability
that is not fully implemented has no explanatory note, or if the generated document is stale.

**Adding a module** takes three steps and no changes elsewhere:

1. add an entry to `MODULES` in `registry.ts`;
2. add record definitions to `collections.ts` if it stores new kinds of data;
3. add `src/modules/<id>.tsx` and one line in `src/shell/modules.ts`.

Module activation is stored per user as synced `modulePrefs` records; switching a module off hides it without touching
its data.

## 3. Definition-driven collections

`collections.ts` describes ~70 record types: fields (text, money, date, select, relation, checklist, recurrence, …),
which views make sense, the status field for boards, the date field for calendars. Three components consume those
definitions:

- **`RecordEditor`** — one form for every record type, with validation, templates, duplicate, archive, delete-with-undo.
- **`CollectionView`** — list / table / board / calendar / cards, search, filters, sorting, grouping, bulk actions,
  CSV import with column mapping, CSV export, custom fields, trash.
- **field controls** — one input and one compact read-only rendering per field type.

Modules compose these with their own logic and visuals. Users extend the model at run time: custom fields and
personal categories are stored as synced settings and need no migration.

## 4. Data layer (local-first)

Every record on a device is one flat object in the `records` table of an IndexedDB database named after the identity
(`lifeos-<userId>` or `lifeos-local`), so accounts sharing a browser never see each other's data.

```ts
{ id, _c: 'tasks', _ca, _ua, _dirty?: 1, _base?: {…last synced fields…}, _seq?, _s: 'search text', ws, deletedAt, ...fields }
```

- Reads are **live queries** (`useRecords`, `useRecord`), so every view updates when data changes — in this tab,
  another tab, or after a sync.
- Writes go through `core/data/store.ts` (`create`, `update`, `remove`, `upsert`). The first edit of a synced record
  snapshots it into `_base`; that snapshot is what makes field-level merging possible.
- Deletes are **soft** (`deletedAt`): tombstones replicate and double as a trash.
- Records that naturally exist once per day use **deterministic ids** (`hl:<habit>:<date>`), so two devices creating
  the same day's record merge.
- **Workspaces** are a `ws` field; switching workspace only changes a filter.

## 5. Synchronisation

One endpoint, `POST /api/sync`, both pushes and pulls.

```
client → { cursor, changes: [{ id, c, base: {changed fields as last synced}, patch: {changed fields now}, ca, ua }] }
server → { applied: [merged records], conflicts, rejected, records: [changes from other devices], cursor, more }
```

**Merge rule** (`src/core/sync/merge.ts`, shared by client and server), per field:

| Receiver's value | Result |
| --- | --- |
| equals the incoming value | nothing to do |
| equals the sender's base value | only the sender changed it → apply |
| differs from both | **conflict** → the more recent write wins and the other value is recorded |

Edits to different fields of the same record therefore always merge. A true conflict is never silent: the server
stores a `conflicts` record (itself synced), so **every device** shows it in Settings → Sync with a one-tap
"use the replaced value instead".

**Server side** (`src/server/sync/engine.ts`): a push runs in one transaction holding the user's row lock; each write
takes the next value of a per-user counter (`users.syncSeq`), which is the pull cursor. Because writers are serialised
per user, a pull can never skip a concurrently committed change. Pulls are paginated across tables without gaps.

**Client side** (`src/core/data/syncClient.ts`): debounced after local writes, on reconnect, on focus and every 30 s;
one tab syncs at a time (Web Locks); edits made while a request is in flight stay queued with the acknowledged version
as their new base; failures back off and never discard data. A 401 pauses sync and shows a banner — local data stays.

## 6. Database

PostgreSQL through Prisma 7 (`prisma/schema.prisma`).

- **Account tables:** `users`, `profiles`, `sessions`, `password_resets`, `rate_limits`, `features`.
- **Synced tables:** `tasks`, `projects`, `goals`, `events`, `habits`, `habit_logs`, `notes`, `transactions`, `budgets`,
  `study_records`, `fitness_records`, `files`, `notifications`, `automations`, `templates`, `activity_log`,
  `workspaces`, `module_preferences`, `user_settings`, and `records` (a document table for long-tail and user-defined
  collections).

Every synced table has the composite primary key **`(userId, id)`** and composite foreign keys, so a row can only
reference rows of the same user — cross-user access is impossible at the schema level, not just in application code.
`src/server/sync/models.ts` maps client fields to typed columns; anything that does not fit a column is preserved in
`extra`, so a record always round-trips unchanged and new fields never require a migration.

## 7. Authentication and security

- Passwords: scrypt (N=2^15, r=8, p=3) with per-password salt. Sessions: random 256-bit token, stored only as a
  SHA-256 hash, in an httpOnly, SameSite=Lax, Secure cookie; rolling 30-day expiry; listed and revocable per device.
- Password reset: single-use recovery code issued at sign-up (works without e-mail); e-mailed link when
  `RESEND_API_KEY` is configured. Reset and login responses do not reveal whether an e-mail is registered.
- Every API handler validates input with zod, checks the session, and scopes queries by `userId`.
- Rate limiting in Postgres (works across serverless instances): login per address+account and per account,
  registration, reset, password checks, sync and export.
- CSRF: SameSite cookie plus an Origin check on state-changing requests.
- Headers: strict Content-Security-Policy (`default-src 'self'`, no third-party origins), `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS.
- Markdown is sanitised with DOMPurify; CSV export neutralises formula injection.
- No passwords for other services are ever stored: the account index has no password field (enforced by a test).

## 8. Offline and PWA

- `/app/[[...path]]` is statically generated and renders the same shell for every URL; navigation uses the History API.
- The service worker (`src/app/sw.js/route.ts`, generated per build) serves the shell network-first with a cached
  fallback, hashed static assets cache-first, and never touches `/api`. On install it caches the shell and its assets;
  the app then warms the cache with every module chunk in the background.
- A new deployment produces a new worker; the app shows "A new version is ready — Update".
- Manifest, maskable icons, shortcuts, safe-area handling and an install button (Settings → About & install).

## 9. Interface

- **Design tokens** in `src/app/globals.css`: dark and light themes, one accent hue, density scale, widget styles.
- **Desktop:** sidebar, top bar (search, capture, mode switch, sync, notifications, account), main workspace, optional
  context panel. **Phone:** top bar, bottom tab bar with capture, searchable launcher, bottom sheets.
- **Spatial mode** (`src/modules/spatial.tsx`): React Three Fiber scene built from live data with adaptive quality,
  on-demand rendering under reduced motion and a 2D fallback.

## 10. Background engines

`src/shell/engines.ts` runs while the app is open: reminders (deterministic notification ids, quiet hours, at most
three pop-ups per pass) and automation rules (`core/lib/automation.ts`: record, schedule and date triggers; conditions;
create / update / tag / notify actions). Nothing claims to run while the app is closed.

## 11. Technology choices

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Motion · three.js / React Three Fiber / drei · Zustand ·
TanStack Query · Dexie · Recharts · dnd-kit · marked + DOMPurify · ts-fsrs · zod · Prisma 7 · PostgreSQL · Vitest ·
Playwright. Redis is intentionally absent: rate limits live in Postgres and there are no server-side jobs yet.

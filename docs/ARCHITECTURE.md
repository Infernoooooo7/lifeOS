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
  another tab, or after a sync. Each collection or record has **one shared** Dexie live query, however many components
  read it: a write re-reads the data once and every reader gets the same array. A query stays subscribed for a minute
  after its last reader unmounts, so returning to a module shows its data immediately.
- Writes go through `core/data/store.ts` (`create`, `update`, `remove`, `upsert`). The first edit of a synced record
  snapshots it into `_base`; that snapshot is what makes field-level merging possible.
- Deletes are **soft** (`deletedAt`): tombstones replicate and double as a trash.
- Records that naturally exist once per day use **deterministic ids** (`hl:<habit>:<date>`), so two devices creating
  the same day's record merge.
- **Workspaces** are a `ws` field; switching workspace only changes a filter.

### Undo and redo

`src/core/data/undo.ts` listens to the store's change events and keeps, in memory, the values each change replaced
(up to 100 steps for this session on this device).

- **Steps:** changes within 350 ms of each other form one step (a bulk action, or completing a repeating task together
  with the next instance it schedules). Repeated saves of the same fields of one record within 5 s collapse into one
  step, so typing with autosave is undone in one go.
- **Applying:** undo writes the old values back as an ordinary change (creations go to the trash, deletions are
  restored), so it syncs and merges like any other edit. A new change clears redo.
- **Left out:** bookkeeping collections, background engines (wrapped in `withoutUndo`), changes arriving from sync
  (they do not pass through the store), and encrypted journal entries. An operation of more than 500 changes clears
  the history instead of flooding it.
- **Reaching it:** Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (or Ctrl+Y) outside text fields and open forms, where the browser's
  own undo applies; "Undo: …" and "Redo: …" in the command palette; and a Redo/Undo button on each toast.

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

Cost per request (measured by `scripts/dev/bench-api.mts`, which counts every statement):

| Request | Queries |
| --- | --- |
| Idle poll (nothing new) — the most frequent request | 1 (session + account counter in one join) |
| Save one edit | ~11 |
| Upload 500 new records (3 batches) | 32 (one multi-row insert per table per batch) |
| Pull with changes | 1 probe (`EXISTS` per table in one `UNION ALL`) + one query per table that changed |

Sync polling uses an in-process rate limiter; login, registration and reset keep the shared Postgres limiter.
Housekeeping (expired sessions, used reset tokens, idle rate-limit rows) runs at most hourly in the background,
triggered by traffic (`src/server/maintenance.ts`). Every API response carries `x-request-id`; requests slower than
800 ms or failing with 5xx log one JSON line with that id.

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
- Two-step verification (optional): time-based codes from an authenticator app (RFC 6238, SHA-1, 30 s, ±1 step),
  set up by QR code and confirmed with a valid code; each accepted step is stored so a code cannot be replayed, and
  concurrent sign-ins with one code cannot both succeed. A recovery-code reset turns it off (the way back in after a
  lost phone). The secret is stored in the database, protected like the rest of the account data.
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
- Journal lock (optional, end-to-end): a passphrase is stretched with PBKDF2-SHA-256 (600 000 iterations, random
  16-byte salt) into a non-extractable AES-256-GCM key held only in memory — gone on reload, after 15 idle minutes, or
  on "Lock". The text of private journal entries is sealed with a fresh 96-bit IV and the record id as additional
  authenticated data (a sealed body moved to another record does not open). Sealing happens in a store write hook
  (`src/core/data/vault.ts`), so every writer is covered; the server, sync payloads and backups carry only
  `{ iv, ct }`. What syncs is the salt and a sealed check value, so another device can verify the passphrase.
  Changing the passphrase re-encrypts every entry in one IndexedDB transaction. Dates, moods and types stay plain so
  charts and streaks work. A forgotten passphrase cannot be recovered — the UI says so before the lock is set.

## 8. Offline and PWA

- `/app/[[...path]]` is statically generated and renders the same shell for every URL; navigation uses the History API.
- The service worker (`src/app/sw.js/route.ts`, generated per build) is registered from the landing page and the app.
  - **Pages:** the app shell (`/app/*`) and the landing page are served **cache-first** and refreshed in the background.
    The installed app opens instantly, with no connection, and while the server is asleep.
  - **Static files:** hashed assets are cache-first, and `/api` is never touched. On install it caches both pages and
    every script they reference; the app then warms the cache with every module chunk, three at a time, Settings first.
  - **Only LIFEOS's own responses are stored:** every response carries an `X-LifeOS-App` header (set in
    `next.config.ts`), and nothing without it is cached. A host's "waking up" page, such as the one Render's free tier
    shows while the server starts, can never replace the app or its scripts.
  - **Updates:** a background refresh keeps a new page only when every script it references is already cached (same
    version). A newer deployment is left to the new service worker, which caches it complete, so the offline copy is
    never half old, half new.
  - `tests/unit/service-worker.test.ts` runs the generated worker against an in-memory Cache API to check this.
- A new deployment produces a new worker; the app shows "A new version is ready — Update".
- **Installable:** Chrome reports no installability errors (checked in `tests/e2e/pwa.spec.ts`).
  - **Share target:** the manifest registers LIFEOS in the system share sheet (`share_target`, GET to `/app`).
    `sharedCapture` in `src/core/lib/capture.ts` turns what arrives into a quick-capture draft: a page becomes a link
    (Android puts the address in the text), a passage a note, a short line is classified. Only `http(s)` addresses
    are accepted, and the parameters are removed from the address bar at once.
  - **Icon badge:** where the Badging API exists, the installed app's icon shows the number of open tasks due today
    or overdue (`dueCount`), updated as tasks change; it can be switched off in Settings → Notifications.
  - The manifest has 192/512 and maskable icons, shortcuts and standalone display, with safe-area handling.
  - The browser's install prompt is captured from the first moment the app or landing page loads, and offered as
    "Install app" on the landing page and in Settings → About & install. iPhone and iPad get the Share → Add to Home
    Screen tip.
- **The animated sky** hands each new nebula from an OffscreenCanvas to the screen as an ImageBitmap, so the GPU never
  stalls copying it back.

### Money at a glance

`src/core/lib/finance-health.ts` answers two questions from the person's own records, and the interface always shows
the numbers each answer was made from.

- **Safe to spend:** the month's income (what has arrived, or the usual month if that is higher), minus regular bills
  whether paid or still to come, minus everything else spent so far, spread over the days left. A regular bill is a
  category that appeared in at least two of the last three months, about once per month; the larger of "usual" and
  "paid" counts. With no income on record it says nothing, and an overspent month never suggests a daily amount.
- **Net worth:** account balances and money owed to you, minus overdrawn accounts and debts, with a six-month trend.
  Savings goals are not added on top, and debts (which keep no history) are held at today's balance in the trend.

Focus sessions hold a Screen Wake Lock while they count down (re-acquired when the app returns to the foreground,
released on pause), so the screen of a phone on a stand does not dim mid-session.

## 9. Interface

- **Design tokens** in `src/app/globals.css`: dark and light themes, one accent hue, density scale, widget styles.
- **Landing hero** (`src/landing/`): a real-time "life core" in three.js. A noise-displaced plasma core sits in a
  thin-film glass shell with a geodesic lattice and HDR rings. Around it are a 26 000-particle accretion disc on
  Keplerian orbits (positions computed in the vertex shader), a starfield and an fbm nebula, and every module as a
  glass moon carrying its own icon (the app's SVG icons drawn to textures). Data packets travel bezier streams to the
  core, with selective-looking bloom (threshold 1.0, so only HDR highlights glow). Hovering a moon names it.
  Everything is procedural; nothing is downloaded. The 2D orbit renders server-side first. The scene loads in its own
  chunk when the browser is idle and has WebGL 2, fades in after its third frame, picks a detail tier per device
  (particles, subdivision, noise octaves, pixel ratio), steps resolution and bloom down when the frame rate drops,
  stops rendering while scrolled out of view, and draws one still frame under `prefers-reduced-motion`.
- **Astral sky** (`src/ui/Cosmos.tsx`): the dark theme is deep indigo space with cool lavender greys and indigo-tinted
  glass. Behind every page is a sky built so that scrolling never makes it stutter or stop: nothing is drawn per frame.
  - **Painted rarely:**
    - The nebula (domain-warped fbm along a Milky Way band, tinted by the accent) is painted by WebGL into a canvas at
      start and then about every 28 s. Each painting is spread over a few frames in strips, at most 0.65 MP; it is soft
      by nature, so scaled up it stays smooth. Each new state crossfades over 7 s.
    - Two depths of stars are painted once with canvas 2D at full device resolution, so they stay crisp.
  - **Moved by the compositor:** all motion is CSS transform and opacity animation on a handful of layers: nebula
    drift, star pan, a shimmer, 18 bright stars twinkling on their own (some with diffraction spikes), and shooting
    stars as animated streaks. The browser runs these on its compositor thread, so they keep moving while the page
    scrolls or the main thread is busy.
  - **Never shows a cleared canvas:** the sky sits in a `100lvh` box (a phone's address bar does not resize it). Star
    canvases are repainted in the same task when the layer outgrows them, and the old nebula stays until the new one
    is ready. A static sky on `<html>` shows while it fades in.
  - **Other behaviour:**
    - starts when the browser is idle, and shaders compile in parallel;
    - pointer parallax on desktop, eased by a CSS transition;
    - pauses while the landing page's 3D hero is on screen;
    - stands still (same sky, no motion) under reduced motion (system or app setting) and on software renderers;
      `localStorage['lifeos.cosmos'] = 'force'` overrides that for testing, and `scripts/dev/sky-probe.mjs` checks
      for black frames;
    - switched off per device in Settings → Appearance; the light theme shows the clouds as pastel tints on a pale
      dawn sky.
  - **Cost:** measured under software rendering with 4× CPU throttling, scrolling averages 23.2 ms per frame with the
    sky against 16.8 ms without it (software compositing overstates this; the previous WebGL version measured 26.4 ms
    and froze during scrolling).
- **Liquid-glass material:** translucent tinted surfaces with specular edge highlights over the sky (plus a faint
  grain) and a pointer-following sheen (`src/ui/GlassFx.tsx`, fine pointers only). The sidebar,
  top bar, context panel, phone tab bar and side sheets float as rounded glass panes. `prefers-reduced-transparency` and
  the Solid / Outline widget styles switch to opaque surfaces.
- **Performance rules for the glass** (each measured; see `docs/TESTING.md`): no CSS-animated or filtered background
  layer (the sky is one WebGL canvas that holds still during scrolling);
  backdrop blur is used only where content moves underneath (top bar, phone tab bar, menus, toasts, floating bars:
  `.glass-chrome`, `.glass-float`), never on in-page cards, full-screen dialog backdrops or large sheets.
- **Narrow layouts:** below 1180 px the sidebar is an icon rail; stat cards size their figures to their own width
  (container query); scrollable tab and segment strips fade at hidden edges and keep the active item in view.
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

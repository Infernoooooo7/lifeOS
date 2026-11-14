# Testing report

Everything in this report was executed; nothing is listed as passing that was not run.

## Results (12 November 2026)

| Suite | Tool | What it covers | Result |
| --- | --- | --- | --- |
| Unit | Vitest | Pure logic in `src/core` | **65 passed** |
| API + sync integration | Vitest against PostgreSQL 16 | HTTP API, sync engine, two simulated devices | **33 passed** |
| End-to-end, desktop (1366×820) | Playwright, Chromium, production build | Whole product through the browser | **33 passed** |
| End-to-end, phone (Pixel 7 profile, touch) | Playwright, Chromium, production build | Workflows and layout | **19 passed** |
| Type check | `tsc --noEmit` (strict) | Whole repository including tests | clean |
| Production build | `next build` | — | succeeds |

Total: **98** unit/integration tests and **52** end-to-end tests, all passing on the final run.

## How to run

```bash
# PostgreSQL must be reachable; tests use a separate database
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/lifeos_test

npm test                # unit + API (migrates the test database first)
npm run build           # e2e runs against the production build
npm run test:e2e        # starts the server on :3211 and runs both device profiles
npm run typecheck
```

## What is tested

**Authentication and authorisation** (`tests/api/auth.test.ts`, `tests/e2e/sync.spec.ts`)
registration and validation · duplicate accounts · wrong password and unknown e-mail give the same answer · protected
endpoints refuse without a session and with a forged cookie · logout invalidates the session server-side · device
sessions list and remote sign-out · a session id from another account cannot be revoked · password change signs out
other devices · password reset with the single-use recovery code · reset requests do not reveal registered e-mails ·
cross-site POSTs are blocked · repeated login attempts are rate-limited · profile update · account deletion removes
all data.

**Database operations and synchronisation** (`tests/api/sync.test.ts`, `tests/api/devices.test.ts`, `tests/unit/merge.test.ts`)
every kind of collection round-trips without losing a field (typed tables and the document table) · edits to
different fields from two devices merge · edits to the same field produce a reported conflict, with the newer write
winning and the older value preserved · deletions replicate as tombstones · editing a deleted record is flagged ·
references survive when a child arrives before its parent · large pulls paginate without skipping · malformed changes
are rejected without failing the batch · **one account can never read or modify another account's records, even with
the same record id** · account export contains everything and no secrets · offline edits stay queued and are not lost
· edits made while a push is in flight are kept.

**Core logic** (`tests/unit`)
recurrence rules and RRULE round-trip · quick-add parser · task grouping, sorting, dependencies, cycle prevention,
recurring instances · finance totals, category breakdown, cash flow, budgets, balances, currency conversion, debt
payoff · habit streaks, weekly targets, consistency · goal progress · FSRS scheduling · automation triggers,
conditions, placeholders, schedules · reminders with deterministic ids and quiet hours · CSV and iCalendar import and
export · backup validation · calculator, unit conversion, time zones · registry and collection-definition consistency.

**Workflows through the UI** (`tests/e2e/workflows.spec.ts`, desktop and phone)
onboarding activates only chosen modules · module activation and deactivation keep data · Marketplace search and
status filters · task quick add, completion, subtasks, recurring tasks, delete with undo · board, calendar, timeline
and table views · bulk tagging · quick capture into notes and finance · universal search · event creation and overlap
detection · habit check-ins · note links, backlinks and version history · finance totals, budgets, reports, accounts
· backup export, import preview, restore modes · rejection of non-backup files · theme and accent persistence.

**Layouts** (`tests/e2e/layout.spec.ts`, desktop and phone)
38 routes render with no console errors, no error screens and **no horizontal overflow** · desktop shows the sidebar
and keyboard shortcuts work · the phone shows the tab bar with ≥44 px non-overlapping targets and a searchable
launcher · forms fit the screen and validate required fields · the landing page.

**Offline and PWA** (`tests/e2e/pwa.spec.ts`)
valid manifest and icons (including maskable) · security headers and no caching of the service worker or API · with
the network off: reload works, deep links into modules work, navigation between modules works, new data can be
written and survives a reload, and non-app pages show the offline fallback.

**Cross-device** (`tests/e2e/sync.spec.ts`)
a task created on one device appears on another and edits flow back · offline changes show as pending and
synchronise after reconnecting · two devices editing offline converge, with merged fields and a visible, restorable
conflict · data created in local mode moves into a newly created account · account isolation through the browser.

**3D** (`tests/e2e/spatial.spec.ts`)
the WebGL scene renders from live data · every view switches · the list panel acts on the same data · orbiting ·
return to Standard mode · fallback when WebGL is unavailable · on-demand rendering under reduced motion.

**Visual check.** `scripts/dev/tour.mjs` restores sample data through the real import flow and screenshots 31 routes
on desktop and phone; both tours ran with zero console errors and zero overflow, and the screenshots were reviewed.

## Defects found by testing and fixed

| Found by | Defect | Fix |
| --- | --- | --- |
| API test | Columns with database defaults came back as extra fields after sync | Unset columns are tracked and omitted on read |
| E2E | Menus closed whenever anything on the page scrolled, including the menu itself | Menus now follow their trigger |
| E2E | Choosing "Standard mode" in Spatial bounced back to Spatial | The start-up redirect runs once at start-up only |
| E2E | The device whose value lost a conflict never saw the conflict notice | Conflict notices are synced records shown on every device |
| E2E | Select controls had no accessible name | `aria-label` on every select-based field |
| E2E | Rate limiting trusted the left-most `X-Forwarded-For` entry | Platform-set headers are preferred; per-account login ceiling added |
| Visual tour | Chart axis labels were clipped; the 3D scene was hidden behind its panel | Axis formatter and margins; camera framing follows the panel |
| Visual tour | Logo gradient vanished when another copy of the logo was hidden | Unique gradient ids |

## Not tested / limits of this run

- **Browsers:** only Chromium was available in the build environment. Firefox and Safari (including iOS Safari and
  its install flow) were not exercised.
- **Real devices:** phone coverage uses device emulation (viewport, touch, user agent), not physical hardware; real
  GPU performance of the 3D mode on low-end phones is unmeasured.
- **Install prompt and system notifications** require user gestures and OS integration that headless tests cannot
  drive; the code paths were reviewed, the manifest and service worker are tested.
- **Memory and long-session profiling** were not performed beyond checking that the 3D module disposes its geometry
  and stops rendering when left.
- **Accessibility** was checked through roles, labels, focus handling and target sizes in tests, not with a screen
  reader or an automated axe audit.
- **Load testing** of the API was not performed.
- **E-mail password reset** needs a Resend key and was not exercised end to end; the recovery-code path is tested.

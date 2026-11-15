# LIFEOS — the personal operating system

**Everything in your life. One intelligent workspace.**

LIFEOS brings tasks, calendar, projects, notes, habits, goals, money, learning, health, journaling, people, travel and
the rest of life's admin into one app with one search, one capture button and one set of data. It works offline,
syncs across your phone, tablet and computer, and installs like a native app — with its own entry in your phone's share sheet and a badge for tasks due.

**Live:** https://lifeos-4x5e.onrender.com — try it without an account (data stays on your device), or create one to
sync. On the free hosting tier, the first visit after a quiet spell can take up to a minute to wake the server.

## What is inside

**331 capabilities in 26 modules — 319 implemented, 4 partial, 1 waiting on an integration, 7 planned.** Every
capability and its honest status is listed in [`docs/FEATURES.md`](docs/FEATURES.md) and in the in-app Marketplace,
where each module can be switched on or off without losing data.

| Module | |
| --- | --- |
| Home | Widget dashboards you arrange; daily overview |
| Tasks | List, board, calendar, timeline and table; sub-tasks, dependencies, recurrence, quick add in plain language |
| Calendar | Month, week, day and agenda; recurring events; overlap warnings; `.ics` import and export |
| Projects | Milestones, progress, health, timeline |
| Notes | Markdown, links and backlinks, graph, version history |
| Habits | Streaks, weekly targets, routines, consistency |
| Goals | Goals, OKRs, milestones, vision board |
| Finance | Accounts, budgets, subscriptions, debts, reports, multiple currencies |
| Learning | Subjects, assignments, exams, spaced-repetition flashcards (FSRS) |
| Health | Workouts, water, sleep, body, meals |
| Journal | Daily pages, moods, prompts, reflections |
| Focus | Pomodoro and deep-work timers, distraction log |
| People | Keep-in-touch rhythms, reconnect queue, birthdays, interaction history |
| Meals | Recipe box, weekly meal plan, servings scaling, one-tap merged shopping list |
| Shopping, Travel, Documents, Entertainment, Digital life, Life admin | The rest of life's lists, dates and paperwork |
| Automation | “When this, then that” rules across modules |
| Insights | Reports and trends; a guided **weekly review** |
| Spatial | Your data as a 3D space (WebGL, with a 2D fallback) |

Around the modules: universal typo-tolerant search and command palette (Ctrl/⌘ K), **undo and redo for any change (Ctrl/⌘ Z)**, quick capture from anywhere that works out what you typed (an expense, an event, a reminder…),
reminders and an inbox, workspaces, custom fields and categories, dark and light themes with a liquid-glass interface,
**end-to-end encrypted private journal entries**, full JSON backup and selective restore, and **imports from Todoist, Google Keep, Markdown (Notion, Obsidian, Bear) and
bank statements (OFX, QFX, QIF)**.

## How it works

- **Local-first.** Every record lives in IndexedDB on the device; the interface reads live from it, so it is instant
  and works with no connection. The app shell is cached by a service worker.
- **Sync.** One endpoint pushes and pulls changes. Merging is field by field, so edits to different fields on two
  devices both survive; a true conflict keeps both values and shows a one-tap restore on every device.
- **Server.** Next.js on Node with PostgreSQL through Prisma. Every synced table is keyed by `(userId, id)`, so one
  account can never reach another's rows, by schema and not only by code. An idle sync poll costs one query.
- **Honest by design.** Nothing in the product pretends: features that need an external service say so, there are no
  third-party trackers, and no AI service is called.

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run it

Requirements: Node.js 22 and PostgreSQL 14 or newer.

```bash
npm ci
cp .env.example .env          # set DATABASE_URL
npx prisma migrate deploy
npm run dev                   # http://localhost:3000
```

| Command | |
| --- | --- |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit and API/sync tests (Vitest, needs `TEST_DATABASE_URL`) |
| `npm run test:e2e` | End-to-end tests in desktop and phone profiles (Playwright) |
| `npm run typecheck` | Strict TypeScript over the whole repository |
| `npm run docs:features` | Regenerate the feature inventory from the registry |

Deployment (Render blueprint included; Vercel and plain Node hosts also work): [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Quality

Every result below was produced by running it — see [`docs/TESTING.md`](docs/TESTING.md) for the full report,
performance measurements and the defects that testing found.

- 190 unit and API/sync tests against a real PostgreSQL database
- 92 end-to-end tests across desktop and phone, including offline use, two devices editing the same data,
  two-step sign-in, end-to-end encrypted journal entries across devices, and WCAG 2.1 AA accessibility checks (axe) in both themes
- Every module route checked for console errors and horizontal overflow at desktop, tablet and phone widths

## Documentation

| | |
| --- | --- |
| [Features](docs/FEATURES.md) | Every capability and its status, generated from the registry |
| [Architecture](docs/ARCHITECTURE.md) | Data model, sync protocol, security, offline, performance rules |
| [Deployment](docs/DEPLOYMENT.md) | Render, Vercel and self-hosting; environment variables |
| [Testing](docs/TESTING.md) | What was tested, results, measurements |
| [Roadmap](docs/ROADMAP.md) | Known limitations and what comes next |
| [Research](docs/RESEARCH.md) | Product and technical research behind the design |
| [Licences](docs/LICENSES.md) | Third-party software and its licences |

## Licence

Proprietary — all rights reserved (see `package.json`). Third-party components keep their own licences, listed in
[`docs/LICENSES.md`](docs/LICENSES.md).

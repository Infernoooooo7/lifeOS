# LIFEOS engineering research report

Research was done before implementation and kept deliberately short: the goal was to borrow proven ideas and mature
libraries, not to survey the field. This report records what was consulted, what was taken from it, and — just as
important — what was **not** verifiable in the build environment.

> **Scope and honesty note.** The build ran in a sandbox whose network policy allowed web search, GitHub and the npm
> registry, but blocked most other sites. Sources below are therefore marked:
> **[read]** fetched and read during the build · **[search]** found through web search and read as search-result
> summaries · **[code]** source code or package contents inspected · **[meta]** repository metadata and licence checked,
> code not read · **[known]** standard reference applied from prior knowledge, not re-fetched · **[blocked]** could not
> be reached.

## 1. Academic and technical sources

| Source | How used | What LIFEOS takes from it |
| --- | --- | --- |
| Kleppmann, Wiggins, van Hardenberg, McGranaghan — *Local-first software: you own your data, in spite of the cloud* (Onward! 2019, doi:10.1145/3359591.3359737) **[search]** | Framing for the whole data layer | The seven ideals as a checklist: no spinners (every read/write hits IndexedDB), multi-device (sync), network optional (offline-first), longevity and ownership (open JSON export, account deletion), privacy (no third-party requests). Collaboration is out of scope: LIFEOS is single-user. |
| Shapiro, Preguiça, Baquero, Zawirski — *Conflict-free Replicated Data Types* (SSS 2011) **[search]** | Evaluated, mostly **not** adopted | A last-writer-wins register per field is the CRDT that fits a single-user personal app. Full CRDT libraries (Automerge, Yjs) were rejected: their strength is concurrent rich-text and multi-user editing, which costs bundle size and storage that LIFEOS does not need. |
| Kulkarni, Demirbas, et al. — *Logical Physical Clocks* (OPODIS 2014) **[search]** and Actual Budget's HLC implementation `packages/crdt/src/crdt/timestamp.ts` **[code]** | Evaluated, **not** adopted | Hybrid logical clocks order writes across devices with skewed clocks. LIFEOS instead sends the *base values* of changed fields and lets the server do a three-way comparison, so a conflict is detected by content, not by clock. Clocks are only the tie-breaker when a true conflict exists, and the losing value is always kept. This is simpler and never silently drops a write. Recorded as a technical risk below. |
| Ye et al. — FSRS, *A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling* (KDD 2022); Anki FAQ on schedulers **[search]** | Adopted through a library | FSRS models difficulty, stability and retrievability per card and outperforms SM-2 in the public benchmark. Used via `ts-fsrs` instead of re-implementing SM-2. |
| RFC 5545 (iCalendar) and RFC 4180 (CSV) **[known]** | Implemented directly | `.ics` import/export including line folding, all-day `VALUE=DATE` with exclusive end, and a supported subset of `RRULE`; CSV with quoted fields, escaped quotes and embedded newlines. Both are small enough that a tested implementation beats a dependency. |
| OWASP Password Storage and Session Management cheat sheets **[known]** | Implemented directly | scrypt with N=2^15, r=8, p=3; random 256-bit session tokens stored only as SHA-256 hashes; httpOnly, SameSite=Lax, Secure cookies; identical responses for unknown e-mails. |
| WCAG 2.2 (target size, contrast, reduced motion), WAI-ARIA dialog and menu patterns **[known]** | Applied | 44 px touch targets on coarse pointers, native `<dialog>` for focus trapping, `prefers-reduced-motion` and an in-app switch, visible focus rings, accessible names on icon buttons and form controls. |
| Next.js 16 documentation bundled in the package (`node_modules/next/dist/docs`, PWA guide) **[read]** | Applied | `app/manifest.ts`, service-worker headers, security headers. |
| Prisma 7 upgrade guidance **[search]** and the installed package **[code]** | Applied | Driver adapter (`@prisma/adapter-pg`), `prisma.config.ts`, the `prisma-client` generator with an explicit output path. |

## 2. GitHub repositories

Repository metadata (stars, licence, last push) was pulled through the GitHub search API on 2026-11-10.

| Repository | Stars | Licence | Depth | Finding |
| --- | ---: | --- | --- | --- |
| actualbudget/actual | 30k | MIT | **[code]** `packages/crdt/src/crdt/timestamp.ts` | Local-first finance with HLC + Merkle sync. Confirmed that a personal app can sync without a heavyweight CRDT; LIFEOS chose an even simpler scheme (see §1). |
| open-spaced-repetition/ts-fsrs | 0.9k | MIT | **[code]** README + installed package API | **Used as a dependency.** v6 requires Node 24, so v5.4.2 is pinned (Node 20+). |
| dexie/Dexie.js | 15k | Apache-2.0 | **[code]** installed package | **Used.** `liveQuery` gives reactive reads that also update across tabs. |
| pmndrs/react-three-fiber, pmndrs/drei | 34k / 10k | MIT | **[code]** installed packages | **Used.** drei's `Text` loads a font from a CDN, which the strict CSP forbids — labels are drawn to canvas textures instead. |
| clauderic/dnd-kit | 18k | MIT | **[code]** installed package | **Used** for boards and the widget grid: pointer + touch sensors, keyboard-friendly. |
| recharts/recharts | 28k | MIT | **[code]** installed package | **Used** for charts, themed through CSS variables. |
| markedjs/marked, cure53/DOMPurify | 37k / 18k | MIT / Apache-2.0 or MPL-2.0 | **[code]** installed packages | **Used** together: Markdown is always sanitised before it reaches the DOM. |
| pmndrs/zustand, TanStack/query | 59k / 51k | MIT | **[code]** installed packages | **Used**: UI state, and the small amount of server-only state (profile, device sessions). |
| automerge/automerge, yjs/yjs | 7k / 23k | MIT | **[meta]** | Not used — see §1. |
| rxdb/rxdb, electric-sql/electric | — / 10k | Apache-2.0 | **[meta]** | Sync engines that bring their own backend model; too much machinery for one Postgres database. |
| serwist/serwist | 1.5k | MIT | **[meta]** | Not used: a ~80-line hand-written service worker generated at build time covers the needed strategies. |
| xyflow/xyflow | 39k | MIT | **[meta]** | Not used: the automation builder is a linear trigger → conditions → actions flow, which a node-graph editor would over-serve. |
| usememos/memos | 64k | MIT | **[meta]** | Product reference for quick capture. |
| logseq/logseq, AppFlowy-IO/AppFlowy, makeplane/plane, TriliumNext/Trilium, siyuan-note/siyuan, firefly-iii/firefly-iii | 25k–79k | **AGPL-3.0** | **[meta]** | Product references only. **No code used** — AGPL is incompatible with keeping the distribution model open. |
| iSoron/uhabits | 10k | **GPL-3.0** | **[meta]** | Product reference only (streak semantics). No code used. |
| hcengineering/platform, n8n-io/n8n, toeverything/AFFiNE | 28k–210k | EPL-2.0 / fair-code / mixed | **[meta]** | Product references only. |

**Not done:** a line-by-line read of the larger reference products. Their licences ruled out reuse, so time went into
LIFEOS's own implementation and tests instead.

## 3. Design, graphics and 3D references

The reference sites named in the brief — Awwwards, Dribbble, Behance, Godly, Mobbin, Lapa Ninja, Codrops, the three.js
examples, the R3F documentation, Shadertoy, Poly Haven, ambientCG, Sketchfab and Kenney — were **[blocked]** by the
build sandbox's network policy (the R3F docs and unpkg were tried and failed to resolve; per the sandbox rules no
further blocked hosts were probed). Nothing in the product is copied from any of them.

The visual and spatial design therefore rests on established practice **[known]** rather than a fresh survey:

- **Identity.** Near-black canvas, one accent hue driven by a single OKLCH variable (user-adjustable), translucent
  surfaces with hairline borders, Space Grotesk for display and numerals, Geist for text. Glows and gradients are
  restricted to the canvas corners and the 3D core so that data stays the brightest thing on screen.
- **Each module keeps its own hue** and layout (calendar grid, kanban, note editor, timer, graph) on a shared kit.
- **Mobile is designed, not shrunk:** bottom tab bar with a raised capture button, bottom sheets, a searchable module
  launcher, month view that switches to dots plus a day list, horizontally snapping boards.
- **3D performance rules** (from the R3F performance guidance and general WebGL practice): cap device pixel ratio, drop
  it when frames decline, instance repeated meshes, low segment counts on phones, no post-processing, render on demand
  under reduced motion, and never make 3D the only path to a feature.
- **Assets.** All geometry is procedural; no models, HDRIs or textures were downloaded, so there is nothing to license.

**Recommended follow-up:** a design review against those galleries once network access allows it.

## 4. Decisions that came out of the research

| Decision | Why |
| --- | --- |
| Local-first with IndexedDB (Dexie) as the source of truth on each device | Instant UI, offline by construction, sync becomes a background concern. |
| Field-level three-way merge instead of CRDT or HLC | Smallest design that never silently loses a write; conflicts are detected by content and surfaced. |
| Soft deletes (tombstones) | Deletions must replicate, and they double as a trash with restore. |
| Deterministic ids for per-day records (habit check-ins, journal, water, reminders) | Two devices creating "today's" record merge instead of duplicating. |
| Typed Postgres tables for core entities plus one document table | Relational integrity where it matters; new collections and custom fields need no migration. |
| One client-rendered catch-all route with History-API navigation | A single cached document serves every `/app/*` URL offline. |
| First-party authentication | No third-party identity provider to configure; works on any Postgres host. |
| Definition-driven collections | ~70 record types get forms, five views, bulk actions, CSV and custom fields from one engine. |
| Strict Content-Security-Policy with self-hosted fonts and no external requests | Personal data deserves a small attack surface; it is also what lets the app run fully offline. |

## 5. Technical risks

| Risk | Mitigation / status |
| --- | --- |
| Device clocks decide the winner of a true same-field conflict | The losing value is always stored as a synced conflict notice and can be restored in one tap; server clamps future timestamps. A hybrid logical clock is the upgrade path. |
| IndexedDB can be evicted by the browser | "Protect this data" requests persistent storage; installing the PWA usually grants it; account sync and JSON backups are the real safety net. |
| Reminders and automations only run while the app is open | Stated in the UI and the registry; missed schedules run once on return. Web Push + a job runner is on the roadmap. |
| Attachments are device-only | Stated in the UI; object storage is on the roadmap. |
| Free-tier hosting sleeps and free databases expire | Documented in `docs/DEPLOYMENT.md`. |
| Large data sets | Lists render incrementally; search is a linear scan over a pre-built text field, fine for tens of thousands of records. A worker-based index is the next step. |

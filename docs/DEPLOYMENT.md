# Deploying LIFEOS

LIFEOS needs two things: a Node.js host for the Next.js app and a PostgreSQL database. One required environment
variable, `DATABASE_URL`, connects them.

## Current deployment

| | |
| --- | --- |
| URL | https://lifeos-4x5e.onrender.com |
| Platform | Render — web service `lifeos` (free plan, Singapore) + PostgreSQL `lifeos-db` (free plan, v16) |
| Source | branch `ccr-b33f1d63-qjl2lu`, managed by the blueprint in `render.yaml`; pushes to that branch redeploy automatically |

Things to know about the free tier:

- **The free database expires 30 days after creation (on 12 December 2026).** Upgrade it in the Render dashboard
  before then, or export your data (Settings → Backup & data) and re-create it. Data on your devices is not affected.
- The free web service **sleeps after 15 minutes without traffic**; the first request afterwards takes up to a minute.
  Once loaded, the app itself keeps working — it is offline-first.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `APP_URL` | no | Public origin (for example `https://lifeos.example.com`). Used in password-reset links and the Origin check. Derived from the request when empty. |
| `RESEND_API_KEY`, `EMAIL_FROM` | no | Enables password reset by e-mail through Resend. Without them, reset works with the recovery code. |
| `DISABLE_REGISTRATION` | no | Set to `1` to close sign-ups on a private deployment |
| `DB_POOL_MAX` | no | Connections per server instance (default 5) |

Secrets belong in the host's environment settings — never in the repository. `.env` is git-ignored;
`.env.example` documents the variables.

## Option A — Vercel + managed Postgres (the intended production setup)

1. Create a PostgreSQL database (Neon, Supabase, Vercel Postgres, …) and copy its connection string. With Neon, use
   the **pooled** connection string.
2. In Vercel: **Add New → Project**, import the repository. Framework preset: Next.js.
3. Add the environment variable `DATABASE_URL` (and any optional ones).
4. Deploy. Vercel runs the `vercel-build` script, which generates the Prisma client, **applies the migrations** and
   builds the app.
5. Open `https://<project>.vercel.app/api/health` — it should answer `{"ok":true,"db":true,…}`.

No other configuration is needed: the API is a single Node.js function, the app shell is static, and the service
worker is generated at build time.

## Option B — Render

Dashboard → **New → Blueprint** → choose the repository. `render.yaml` creates the web service and the database and
wires `DATABASE_URL` between them. Migrations are applied by the start command.

## Option C — any Node host or a VPS

```bash
npm ci --include=dev
DATABASE_URL=postgresql://… npm run build
DATABASE_URL=postgresql://… npx prisma migrate deploy
DATABASE_URL=postgresql://… npx next start -p 3000
```

Put it behind HTTPS (the session cookie is `Secure` in production, and service workers require HTTPS).

## After deploying

- `npm run db:seed` (optional) mirrors the feature registry into the `features` table.
- Create an account, then check Settings → Sync shows "Up to date".
- Install the app from the browser menu to verify the PWA.

## Updating

Push to the deployed branch. Migrations in `prisma/migrations` are applied automatically on Vercel (build) and Render
(start). Users see "A new version of LIFEOS is ready" and update with one tap; data on devices is untouched.

## Backups

- **Users** can download everything as JSON at any time (Settings → Backup & data) and restore it selectively.
- **Operators** should enable the database provider's backups / point-in-time recovery. Every synced table is keyed by
  `(userId, id)`, so `pg_dump` restores are straightforward.

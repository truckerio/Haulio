# Hosting Readiness Audit (Vercel + Railway)

Target deployment:
- Web: `https://app.haulio.us` (Vercel)
- API: `https://api.haulio.us` (Railway)
- Postgres + Redis: Railway
- Worker: Railway (optional, recommended)

## Repo map (Phase 0)
- Monorepo: `pnpm-workspace.yaml` (apps + packages).
- Web app: `apps/web` (Next.js 14 App Router).
- API: `apps/api` (Express + TS).
- Worker: `apps/worker` (TS worker loop).
- DB: `packages/db` (Prisma schema + client).

## Web (Vercel)
- PASS — Next.js app location and build script. Evidence: `apps/web/package.json:1` (Next.js + build script).
  Fix: Set Vercel root directory to `apps/web` and build command to `pnpm --filter @truckerio/web build`.
- PASS — API base is centralized (no localhost hardcoding in client). Evidence: `apps/web/lib/apiBase.ts:1`.
  Fix: Set `NEXT_PUBLIC_API_BASE=https://api.haulio.us` in Vercel.
- PASS — API requests include cookies. Evidence: `apps/web/lib/api.ts:21` and `apps/web/lib/api.ts:46`.
- PASS — Optional same-origin proxy via rewrites. Evidence: `apps/web/next.config.js:7`.
  Fix (optional): set `API_BASE_INTERNAL=https://api.haulio.us` in Vercel if you want `/api/*` proxying.
- PASS — Public env vars are limited to non-secrets. Evidence: `apps/web/lib/api.ts:3`, `apps/web/app/loads/[id]/page.tsx:413`.

## API (Railway)
- PASS — Binds to Railway `PORT` and `0.0.0.0`. Evidence: `apps/api/src/index.ts:12310`.
- PASS — Health endpoint exists. Evidence: `apps/api/src/index.ts:929`.
- PASS — CORS allowlist supports multiple origins via `CORS_ORIGINS` and `WEB_ORIGIN`. Evidence: `apps/api/src/index.ts:876`.
  Fix: Set `WEB_ORIGIN=https://app.haulio.us` and `CORS_ORIGINS=https://app.haulio.us,https://<vercel-preview>.vercel.app`.
- PASS — Session + CSRF cookies secure in prod. Evidence: `apps/api/src/lib/auth.ts:43`, `apps/api/src/lib/csrf.ts:11`.
  Optional: set `app.set("trust proxy", 1)` if you rely on proxy IP headers (not required for current cookie logic).

## DB (Prisma)
- PASS — Prisma schema present. Evidence: `packages/db/prisma/schema.prisma:1`.
- PASS — Migration deploy command exists. Evidence: `packages/db/package.json:6`.
  Fix: Use `pnpm --filter @truckerio/db exec prisma migrate deploy` on Railway.

## Worker (Railway)
- PASS — Dockerfile provided for worker build/run. Evidence: `Dockerfile.worker:1`.
  Fix: Use Dockerfile deployment on Railway (recommended).
- FAIL (only if using Nixpacks) — No `start` script for worker. Evidence: `apps/worker/package.json:1`.
  Fix: Use Dockerfile OR add `"build"`/`"start"` scripts (optional).

## File uploads / storage
- FAIL — Uploads are stored on local filesystem (`UPLOAD_DIR`) and must be persistent. Evidence: `apps/api/src/lib/uploads.ts:36`.
  Fix: Attach a Railway Volume (e.g., `/data`) and set `UPLOAD_DIR=/data/uploads`.
  Note: S3/Supabase is a future upgrade, not required for MVP.

## Security
- PASS — CORS allowlist enforced in prod (`WEB_ORIGIN`/`CORS_ORIGINS`). Evidence: `apps/api/src/index.ts:903`.
- PASS — CSRF protection with header + cookie. Evidence: `apps/api/src/lib/csrf.ts:19`.

## Domains / DNS
- Set DNS:
  - `app.haulio.us` → `CNAME` to `cname.vercel-dns.com`
  - `api.haulio.us` → `CNAME` to your Railway public domain (e.g., `xxxx.up.railway.app`)

## Monorepo build
- PASS — Vercel build path is `apps/web`, no custom output dir. Evidence: `apps/web/package.json:1`.
- PASS — Railway can use Dockerfiles for API/Worker. Evidence: `Dockerfile.api:1`, `Dockerfile.worker:1`.

## Env templates
Use `.env.hosting.example` as the template:
- Evidence: `.env.hosting.example:1`.

### Vercel (Production)
- `NEXT_PUBLIC_API_BASE=https://api.haulio.us`
- `NEXT_PUBLIC_WEB_ORIGIN=https://app.haulio.us`
- `NEXT_PUBLIC_QUICKBOOKS_ENABLED=false`
- Optional: `API_BASE_INTERNAL=https://api.haulio.us` (only if you want `/api/*` proxying)

### Railway API
- `NODE_ENV=production`
- `DATABASE_URL=...`
- `REDIS_URL=...`
- `SESSION_SECRET=...`
- `CSRF_SECRET=...`
- `WEB_ORIGIN=https://app.haulio.us`
- `CORS_ORIGINS=https://app.haulio.us,https://<vercel-preview>.vercel.app`
- `UPLOAD_DIR=/data/uploads`
- `MAX_UPLOAD_MB=15`
- SMTP vars if using password resets

### Railway Worker
- `NODE_ENV=production`
- `DATABASE_URL=...`
- `REDIS_URL=...`
- `UPLOAD_DIR=/data/uploads`

## Applied fixes (small diffs)
```diff
--- a/apps/api/src/index.ts
+++ b/apps/api/src/index.ts
@@
-const explicitOrigins = [process.env.WEB_ORIGIN].filter(Boolean) as string[];
+const explicitOrigins = Array.from(
+  new Set(
+    [process.env.WEB_ORIGIN, ...(process.env.CORS_ORIGINS || "").split(",")]
+      .map((value) => value?.trim())
+      .filter(Boolean),
+  ),
+);
@@
-const port = Number(process.env.API_PORT || 4000);
+const port = Number(process.env.PORT || process.env.API_PORT || 4000);
```

```diff
--- a/packages/db/package.json
+++ b/packages/db/package.json
@@
   "scripts": {
     "build": "tsc -p tsconfig.json",
     "migrate": "prisma migrate dev",
+    "migrate:deploy": "prisma migrate deploy",
     "seed": "tsx prisma/seed.ts",
     "studio": "prisma studio"
   },
```

```diff
--- a/.env.hosting.example
+++ b/.env.hosting.example
@@
-# API
-API_PORT=4000
-WEB_ORIGIN="https://app.yourdomain.com"
-API_BASE="https://api.yourdomain.com"
+# API
+# Railway sets PORT automatically; leave API_PORT unset unless you need an override.
+WEB_ORIGIN="https://app.yourdomain.com"
+CORS_ORIGINS="https://app.yourdomain.com,https://your-vercel-preview.vercel.app"
+API_BASE="https://api.yourdomain.com"
```

## Step-by-step hosting (Vercel + Railway)

### 1) Vercel (Web)
1. New Project → import the repo.
2. Root directory: `apps/web`.
3. Build command: `pnpm --filter @truckerio/web build`.
4. Output dir: default.
5. Set env vars:
   - `NEXT_PUBLIC_API_BASE=https://api.haulio.us`
   - `NEXT_PUBLIC_WEB_ORIGIN=https://app.haulio.us`
   - `NEXT_PUBLIC_QUICKBOOKS_ENABLED=false`
   - Optional: `API_BASE_INTERNAL=https://api.haulio.us`.
6. Add custom domain `app.haulio.us` → follow Vercel DNS instructions.

### 2) Railway (API)
1. Create Railway project → add a service from GitHub.
2. Use Dockerfile: set the Dockerfile path to `Dockerfile.api`.
3. Add a PostgreSQL plugin and a Redis plugin (Railway).
4. Set env vars (see “Railway API” above) including `DATABASE_URL` + `REDIS_URL`.
5. Add a Volume and mount to `/data` → set `UPLOAD_DIR=/data/uploads`.
6. Run migrations: `pnpm --filter @truckerio/db exec prisma migrate deploy`.
7. Add custom domain `api.haulio.us` in Railway.

### 3) Railway (Worker)
1. Add another service from the same repo.
2. Use Dockerfile path `Dockerfile.worker`.
3. Set env vars (see “Railway Worker” above).
4. Reuse the same Postgres + Redis and same `/data` volume if possible.

## Final Go/No-Go
- GO if:
  - `api.haulio.us/health` returns `{ ok: true }`
  - Web loads from `https://app.haulio.us` and calls `https://api.haulio.us/*`
  - Login succeeds and cookies persist
- NO-GO if:
  - API is serving on localhost only
  - CORS not allowlisted
  - Upload volume is missing

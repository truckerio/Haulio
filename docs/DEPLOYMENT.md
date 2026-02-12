# Deployment Guide

This repo supports:
- Production-like local via Docker Compose
- Production deploys via GitHub + Railway (API/Worker) + Vercel (Web)

## Production-like local (Docker Compose)

1) Create the local prod env file:

```sh
cp .env.prod.local.example .env.prod.local
```

2) Start the stack (builds images):

```sh
pnpm prod:local
```

This uses `.env.prod.local` for runtime and build-time variables (including
`NEXT_PUBLIC_API_BASE` for the Next.js build).

3) Open:
- Web: http://localhost:3000
- API: http://localhost:4000

4) Stop:

```sh
pnpm prod:local:down
```

## Production deploy (Git + Railway + Vercel)

### 1) Commit + push

```sh
git status

git add -A

git commit -m "your message"

git push origin main
```

Pushing to `main` triggers connected Railway/Vercel deployments.

### 2) Railway (API + Worker)

Railway uses Dockerfiles:
- API: `Dockerfile.api` (configured in `railway.json`)
- Worker: `Dockerfile.worker` (configured in `railway.worker.json`)

Required env keys (set in Railway service env):
- `DATABASE_URL`
- `REDIS_URL`
- `WEB_ORIGIN`
- `UPLOAD_DIR`
- `SESSION_SECRET`
- `CSRF_SECRET`
- `MAX_UPLOAD_MB`

Optional/other keys as needed by your org (SMTP, QuickBooks, etc.).

CLI deploy (optional):

```sh
npx -y @railway/cli@latest login
npx -y @railway/cli@latest link

# Deploy API (select @truckerio/api service when prompted)
npx -y @railway/cli@latest up

# Deploy Worker (select @truckerio/worker service when prompted)
npx -y @railway/cli@latest up
```

### 3) Vercel (Web)

Vercel should build from `apps/web` with:
- Build command: `pnpm --filter @truckerio/web build`
- Output: default Next.js output

Required env keys (set in Vercel project env):
- `NEXT_PUBLIC_API_BASE`
- `NEXT_PUBLIC_WEB_ORIGIN`

Optional (if using rewrites proxy):
- `API_BASE_INTERNAL`

CLI deploy (optional):

```sh
cd apps/web
vercel --prod
```

## Railway env mapping

The same keys used in `.env.prod.local` should be set in Railway and Vercel.
`.env.prod.local` is for local use only and is gitignored.

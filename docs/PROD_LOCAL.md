# Production-Like Local (Docker Compose)

This mode mirrors Railway-style containers with built artifacts and no hot reload.

## Run prod-like local
1) Copy the template and fill required values:

```sh
cp .env.prod.local.example .env.prod.local
```

2) Start the stack (builds images):

```sh
pnpm prod:local
```

This uses `.env.prod.local` for runtime and build-time vars. `NEXT_PUBLIC_API_BASE`
must be set there because Next.js reads it during `next build`.

3) Open the app:

- Web: http://localhost:3000
- API: http://localhost:4000

## Stop

```sh
pnpm prod:local:down
```

## Required env keys
Set these in `.env.prod.local`:

- `NODE_ENV`
- `DATABASE_URL`
- `REDIS_URL`
- `WEB_ORIGIN`
- `NEXT_PUBLIC_WEB_ORIGIN`
- `NEXT_PUBLIC_API_BASE`
- `API_BASE`
- `UPLOAD_DIR`
- `SESSION_SECRET`
- `CSRF_SECRET`

Optional but recommended:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `MAX_UPLOAD_MB`

## Railway mapping
Use the same keys in Railway service env vars:

- API + Worker: `DATABASE_URL`, `REDIS_URL`, `WEB_ORIGIN`, `UPLOAD_DIR`, `SESSION_SECRET`, `CSRF_SECRET`, `MAX_UPLOAD_MB`
- Web: `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_WEB_ORIGIN`

`.env.prod.local` is for local use only and is gitignored.

# Local Prod Setup (Mac)

This guide runs the production-like stack locally with Docker (`web`, `api`, `worker`, `postgres`, `redis`) and supports LAN access for testing from other devices.

## 1) Install dependencies

1. Install Docker Desktop for Mac and start it.
2. Install Homebrew (if missing):
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
3. Install Git + Node 20 LTS:
```bash
brew install git node@20
```
4. Enable pnpm via Corepack:
```bash
corepack enable
corepack prepare pnpm@9.0.0 --activate
```
5. Verify tools:
```bash
docker --version
docker compose version
node -v
pnpm -v
git --version
```

## 2) Get code and install project packages

```bash
git clone <your-repo-url> demo-truckerio1
cd demo-truckerio1
pnpm install
```

## 3) Configure local prod environment

1. Copy env template:
```bash
cp .env.prod.local.example .env.prod.local
```
2. Edit `.env.prod.local` and set at minimum:
- `SESSION_SECRET`
- `CSRF_SECRET`
- `MFA_SECRET`

Quick random values:
```bash
openssl rand -hex 32
```

Recommended local values:
- `NEXT_PUBLIC_API_BASE=/api`
- `WEB_ORIGIN=http://localhost:3000`
- `NEXT_PUBLIC_WEB_ORIGIN=http://localhost:3000`

## 4) Start prod-local stack

```bash
pnpm prod:local
```

Services:
- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Postgres: `localhost:5433`
- Redis: `localhost:6380`

## 5) Apply DB schema (required on fresh DB)

```bash
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml run --rm api pnpm --filter @truckerio/db exec prisma migrate deploy
```

If migration history is incompatible for your branch, use fallback in `docs/LOCAL_PROD_TROUBLESHOOTING.md`.

## 6) Create/reset company admin

```bash
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml run --rm \
  -e COMPANY_NAME="Wrath Logistics" \
  -e ADMIN_EMAIL="wrath@admin.com" \
  -e ADMIN_PASSWORD="password123" \
  -e ADMIN_NAME="Admin" \
  -e RESET_UPLOADS=false \
  api pnpm --filter @truckerio/api exec tsx scripts/company-reset.ts
```

## 7) Seed fleet/ops demo data (10 trucks, 10 trailers, 10 loads, 15 drivers, 10 dispatchers)

```bash
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml run --rm \
  -e ORG_NAME="Wrath Logistics" \
  -e TARGET_TRUCKS=10 \
  -e TARGET_TRAILERS=10 \
  -e TARGET_LOADS=10 \
  -e TARGET_DRIVERS=15 \
  -e TARGET_DISPATCHERS=10 \
  -e SEED_PASSWORD="password123" \
  api pnpm --filter @truckerio/api exec tsx scripts/seed-org-data.ts
```

## 8) Validate health

```bash
curl http://localhost:4000/health
curl http://localhost:3000/api/setup/status
```

## 9) LAN mode (same Wi-Fi/LAN)

1. Find host IP:
```bash
ipconfig getifaddr en0 || ipconfig getifaddr en1
```
2. Update `.env.prod.local`:
- `WEB_ORIGIN=http://<HOST_IP>:3000`
- `NEXT_PUBLIC_WEB_ORIGIN=http://<HOST_IP>:3000`
- `CORS_ORIGINS=http://<HOST_IP>:3000,http://localhost:3000`
- keep `NEXT_PUBLIC_API_BASE=/api`
3. Restart stack:
```bash
pnpm prod:local:down
pnpm prod:local
```
4. Open from another device:
- `http://<HOST_IP>:3000`

## 10) Day-to-day commands

Start/update images:
```bash
pnpm prod:local
```

Stop:
```bash
pnpm prod:local:down
```

View logs:
```bash
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml logs -f --tail=200
```

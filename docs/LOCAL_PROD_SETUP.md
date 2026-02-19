# Local Prod Developer Setup

This devkit provides a production-like local stack (`web`, `api`, `worker`, `postgres`, `redis`) plus repeatable reset/seed scripts so any teammate can run the same environment.

Dependency download checklists:
- Mac: `docs/LOCAL_PROD_DEPENDENCIES_MAC.md`
- Windows: `docs/LOCAL_PROD_DEPENDENCIES_WINDOWS.md`

## Included assets

- Compose stack: `infra/docker/docker-compose.prod-local.yml`
- Env template: `.env.prod.local.example` (no secrets)
- One-command setup: `scripts/dev/bootstrap-prod-local.sh`
- Reset + seed: `scripts/dev/reset-and-seed.sh`

## Prerequisites

### Mac

1. Install Docker Desktop.
2. Install Node 20 LTS and pnpm:
```bash
brew install node@20
corepack enable
corepack prepare pnpm@9.0.0 --activate
```
3. Verify:
```bash
docker --version
docker compose version
node -v
pnpm -v
```

### Windows (PowerShell)

1. Install Docker Desktop (WSL2 backend).
2. Install Node 20 LTS and Git:
```powershell
winget install -e --id Docker.DockerDesktop
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Git.Git
```
3. Enable pnpm:
```powershell
corepack enable
corepack prepare pnpm@9.0.0 --activate
```
4. Verify:
```powershell
docker --version
docker compose version
node -v
pnpm -v
```

## Team bootstrap flow

1. Clone repo and install dependencies:
```bash
git clone <repo-url> demo-truckerio1
cd demo-truckerio1
pnpm install
```

2. Create local prod env file:
```bash
cp .env.prod.local.example .env.prod.local
```

3. Set secrets in `.env.prod.local`:
- `SESSION_SECRET`
- `CSRF_SECRET`
- `MFA_SECRET`

4. Start + migrate + reset + seed (Mac/Linux):
```bash
./scripts/dev/bootstrap-prod-local.sh
```

On Windows, run the equivalent from PowerShell:
```powershell
pnpm install
pnpm prod:local
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml run --rm api pnpm --filter @truckerio/db exec prisma migrate deploy
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml run --rm -e COMPANY_NAME="Haulio Demo Logistics" -e ADMIN_EMAIL="admin@demo.test" -e ADMIN_PASSWORD="demo1234" -e ADMIN_NAME="Admin" -e RESET_UPLOADS=false api pnpm --filter @truckerio/api exec tsx scripts/company-reset.ts
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml run --rm -e ORG_NAME="Haulio Demo Logistics" -e TARGET_TRUCKS=10 -e TARGET_TRAILERS=10 -e TARGET_LOADS=10 -e TARGET_DRIVERS=15 -e TARGET_DISPATCHERS=10 -e SEED_PASSWORD="demo1234" api pnpm --filter @truckerio/api exec tsx scripts/seed-org-data.ts
```

## Default credentials (from bootstrap)

- Company: `Haulio Demo Logistics`
- Admin email: `admin@demo.test`
- Password: `demo1234`

## Service endpoints

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Postgres: `localhost:5433`
- Redis: `localhost:6380`

## Repeatable reset/seed

Use this whenever local data gets inconsistent:

```bash
./scripts/dev/reset-and-seed.sh
```

Env overrides are supported, for example:

```bash
COMPANY_NAME="Wrath Logistics" \
ADMIN_EMAIL="wrath@admin.com" \
ADMIN_PASSWORD="password123" \
TARGET_TRUCKS=10 TARGET_TRAILERS=10 TARGET_LOADS=10 TARGET_DRIVERS=15 TARGET_DISPATCHERS=10 \
./scripts/dev/reset-and-seed.sh
```

## Stop stack

```bash
pnpm prod:local:down
```

# Local Prod Setup (Windows)

This guide runs the production-like stack locally with Docker (`web`, `api`, `worker`, `postgres`, `redis`) and supports LAN access for testing from other devices.

Recommended shell: **PowerShell**.

## 1) Install dependencies

1. Enable virtualization in BIOS (if disabled).
2. Install WSL2 + Ubuntu (required by Docker Desktop backend).
3. Install tools (via winget):
```powershell
winget install -e --id Docker.DockerDesktop
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Git.Git
```
4. Start Docker Desktop and wait until it is fully running.
5. Enable pnpm via Corepack:
```powershell
corepack enable
corepack prepare pnpm@9.0.0 --activate
```
6. Verify tools:
```powershell
docker --version
docker compose version
node -v
pnpm -v
git --version
```

## 2) Get code and install project packages

```powershell
git clone <your-repo-url> demo-truckerio1
cd demo-truckerio1
pnpm install
```

## 3) Configure local prod environment

1. Copy env template:
```powershell
Copy-Item .env.prod.local.example .env.prod.local
```
2. Edit `.env.prod.local` and set at minimum:
- `SESSION_SECRET`
- `CSRF_SECRET`
- `MFA_SECRET`

Use long random strings. Example (PowerShell):
```powershell
[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

Recommended local values:
- `NEXT_PUBLIC_API_BASE=/api`
- `WEB_ORIGIN=http://localhost:3000`
- `NEXT_PUBLIC_WEB_ORIGIN=http://localhost:3000`

## 4) Start prod-local stack

```powershell
pnpm prod:local
```

Services:
- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Postgres: `localhost:5433`
- Redis: `localhost:6380`

## 5) Apply DB schema (required on fresh DB)

```powershell
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml run --rm api pnpm --filter @truckerio/db exec prisma migrate deploy
```

If migration history is incompatible for your branch, use fallback in `docs/LOCAL_PROD_TROUBLESHOOTING.md`.

## 6) Create/reset company admin

```powershell
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml run --rm -e COMPANY_NAME="Wrath Logistics" -e ADMIN_EMAIL="wrath@admin.com" -e ADMIN_PASSWORD="password123" -e ADMIN_NAME="Admin" -e RESET_UPLOADS=false api pnpm --filter @truckerio/api exec tsx scripts/company-reset.ts
```

## 7) Seed fleet/ops demo data (10 trucks, 10 trailers, 10 loads, 15 drivers, 10 dispatchers)

```powershell
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml run --rm -e ORG_NAME="Wrath Logistics" -e TARGET_TRUCKS=10 -e TARGET_TRAILERS=10 -e TARGET_LOADS=10 -e TARGET_DRIVERS=15 -e TARGET_DISPATCHERS=10 -e SEED_PASSWORD="password123" api pnpm --filter @truckerio/api exec tsx scripts/seed-org-data.ts
```

## 8) Validate health

```powershell
curl http://localhost:4000/health
curl http://localhost:3000/api/setup/status
```

## 9) LAN mode (same Wi-Fi/LAN)

1. Find host IPv4:
```powershell
ipconfig
```
2. Update `.env.prod.local`:
- `WEB_ORIGIN=http://<HOST_IP>:3000`
- `NEXT_PUBLIC_WEB_ORIGIN=http://<HOST_IP>:3000`
- `CORS_ORIGINS=http://<HOST_IP>:3000,http://localhost:3000`
- keep `NEXT_PUBLIC_API_BASE=/api`
3. Restart stack:
```powershell
pnpm prod:local:down
pnpm prod:local
```
4. Open from another device:
- `http://<HOST_IP>:3000`

## 10) Day-to-day commands

Start/update images:
```powershell
pnpm prod:local
```

Stop:
```powershell
pnpm prod:local:down
```

View logs:
```powershell
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml logs -f --tail=200
```

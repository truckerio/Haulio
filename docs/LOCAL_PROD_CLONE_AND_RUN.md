# Local Prod Clone and Run

This is the fastest path for a teammate to clone the repo and run the local-prod devkit.

## 1) Clone and checkout branch

```bash
git clone <YOUR_REPO_URL> demo-truckerio1
cd demo-truckerio1
git fetch --all --tags
git checkout release/prod-local-devkit
```

If you want a fixed release instead of a moving branch:

```bash
git checkout tags/prod-local-v1.1.0 -b prod-local-v1.1.0
```

## 2) Install dependencies

Follow one platform checklist first:
- Mac: `docs/LOCAL_PROD_DEPENDENCIES_MAC.md`
- Windows: `docs/LOCAL_PROD_DEPENDENCIES_WINDOWS.md`

## 3) Create environment file

Mac/Linux:
```bash
cp .env.prod.local.example .env.prod.local
```

Windows PowerShell:
```powershell
Copy-Item .env.prod.local.example .env.prod.local
```

Set these required secrets in `.env.prod.local`:
- `SESSION_SECRET`
- `CSRF_SECRET`
- `MFA_SECRET`

## 4) Run local-prod

Mac/Linux:
```bash
pnpm prod:local:bootstrap
```

Windows PowerShell:
```powershell
pnpm install
pnpm prod:local
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml run --rm api pnpm --filter @truckerio/db exec prisma migrate deploy
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml run --rm -e COMPANY_NAME=\"Haulio Demo Logistics\" -e ADMIN_EMAIL=\"admin@demo.test\" -e ADMIN_PASSWORD=\"demo1234\" -e ADMIN_NAME=\"Admin\" -e RESET_UPLOADS=false api pnpm --filter @truckerio/api exec tsx scripts/company-reset.ts
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml run --rm -e ORG_NAME=\"Haulio Demo Logistics\" -e TARGET_TRUCKS=10 -e TARGET_TRAILERS=10 -e TARGET_LOADS=10 -e TARGET_DRIVERS=15 -e TARGET_DISPATCHERS=10 -e SEED_PASSWORD=\"demo1234\" api pnpm --filter @truckerio/api exec tsx scripts/seed-org-data.ts
```

## 5) Access app

- Web: `http://localhost:3000`
- API health: `http://localhost:4000/health`
- Default admin: `admin@demo.test`
- Default password: `demo1234`

## 6) Stop app

```bash
pnpm prod:local:down
```

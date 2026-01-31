# Haulio Windows Server Hosting Steps

This guide shows how to run the Haulio web + API on a Windows Server and attach a domain.

---

## Option A (Recommended): Docker + Docker Compose

### 1) Prerequisites
- Windows Server 2019/2022 with Desktop Experience
- Administrator access
- Public IP address
- Domain name pointing to the server IP

### 2) Install Docker
1) Enable required Windows features:
   - Open PowerShell (Admin) and run:
     ```powershell
     Install-WindowsFeature -Name Containers
     Install-WindowsFeature -Name Hyper-V
     ```
2) Install Docker Desktop (or Mirantis Container Runtime if required by policy).
3) Reboot when prompted.

### 3) Install Git + Node (for local scripts)
- Install Git for Windows
- Install Node.js LTS (18+)
- Install pnpm:
  ```powershell
  npm install -g pnpm
  ```

### 4) Clone the repo
```powershell
git clone <YOUR_REPO_URL>
cd <repo>
```

### 5) Create production env file
Create `.env.docker` (or `.env.production`) with real values. Example:
```
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/truckerio"
REDIS_URL="redis://redis:6379"
SESSION_SECRET="<random>"
CSRF_SECRET="<random>"
NEXT_PUBLIC_API_BASE="https://api.yourdomain.com"
WEB_ORIGIN="https://app.yourdomain.com"
API_PORT=4000
API_BASE="https://api.yourdomain.com"
UPLOAD_DIR="/app/uploads"
MAX_UPLOAD_MB=15
INVOICE_PREFIX="INV-"
PUPPETEER_NO_SANDBOX="true"
```

### 6) Start services
```powershell
docker-compose -f docker-compose.demo.yml up -d --build
```
This starts:
- API on port 4000
- Web on port 3000
- Postgres
- Redis
- Worker

### 7) Run migrations
```powershell
docker-compose -f docker-compose.demo.yml exec -T api pnpm --filter @truckerio/db exec prisma migrate deploy
```

---

## Option B: Native Windows (no Docker)

### 1) Install dependencies
- Node.js LTS 18+ (includes npm)
- pnpm: `npm install -g pnpm`
- PostgreSQL 15
- Redis (Windows build or via WSL)

### 2) Configure Postgres
- Create DB `truckerio`
- Create user/password

### 3) Set environment variables
Create `.env` in repo root or set system env vars:
```
DATABASE_URL="postgresql://<user>:<pass>@localhost:5432/truckerio"
REDIS_URL="redis://localhost:6379"
SESSION_SECRET="<random>"
CSRF_SECRET="<random>"
NEXT_PUBLIC_API_BASE="https://api.yourdomain.com"
WEB_ORIGIN="https://app.yourdomain.com"
API_PORT=4000
API_BASE="https://api.yourdomain.com"
UPLOAD_DIR="<absolute path to uploads>"
MAX_UPLOAD_MB=15
INVOICE_PREFIX="INV-"
```

### 4) Install deps + migrate
```powershell
pnpm install
pnpm --filter @truckerio/db exec prisma generate
pnpm --filter @truckerio/db exec prisma migrate deploy
```

### 5) Run services (dev or prod)
- API: `pnpm --filter @truckerio/api dev`
- Web: `pnpm --filter @truckerio/web exec next dev --port 3000`
- Worker: `pnpm --filter @truckerio/worker dev`

For production, build and run with a process manager (NSSM or PM2).

---

## Domain + SSL (IIS Reverse Proxy)

### 1) Install IIS + ARR + URL Rewrite
- Install IIS from Server Manager
- Install Application Request Routing (ARR)
- Install URL Rewrite module

### 2) Configure reverse proxy
Create two sites in IIS:

**Site 1: app.yourdomain.com**
- Forward all requests to `http://localhost:3000`

**Site 2: api.yourdomain.com**
- Forward all requests to `http://localhost:4000`

### 3) DNS
- Create A records:
  - `app.yourdomain.com` -> server public IP
  - `api.yourdomain.com` -> server public IP

### 4) SSL (Win-ACME)
Use win-acme to issue and auto-renew certificates:
1) Install win-acme
2) Run interactive wizard
3) Select IIS sites for `app.yourdomain.com` and `api.yourdomain.com`

### 5) Firewall
Allow ports 80 and 443 inbound.

---

## Notes
- If you want a single domain (e.g., `yourdomain.com`), you can proxy `/api` to port 4000 and everything else to 3000.
- Make sure `NEXT_PUBLIC_API_BASE` and `API_BASE` match the final domain(s).
- Use strong secrets for `SESSION_SECRET` and `CSRF_SECRET`.
- Keep database backups and monitor storage for uploads.

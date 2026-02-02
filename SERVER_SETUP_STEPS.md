# Haulio Server Setup & Troubleshooting (Docker)

This is a single, practical handout for running Haulio on a server (Windows/Linux) and troubleshooting common issues.

---

## 1) What you are running

Services (Docker):
- **web**: Next.js app (port 3000)
- **api**: Node API (port 4000)
- **worker**: background jobs
- **postgres**: database
- **redis**: cache/queue

The **web** server now proxies API requests through `/api` so browsers never need direct access to port 4000.

---

## 2) Prerequisites

### Windows Server
- Install **Docker Desktop** (with WSL2) or **Docker Engine** + WSL2.
- Install **Git**.
- Make sure ports 80/443 are allowed in your firewall.

### Linux Server
- Install **Docker Engine** + **Docker Compose plugin**.
- Install **Git**.
- Open ports 80/443.

---

## 3) Clone the repo

```bash
git clone <your-repo-url>
cd demo-truckerio1
```

---

## 4) Environment configuration

We use `.env.docker` for Docker builds.

Key values:
- `NEXT_PUBLIC_API_BASE="/api"`   (frontend will call `/api/...`)
- `API_BASE_INTERNAL="http://api:4000"` (Next.js proxy -> API container)
- `API_PORT=4000`
- `API_HOST=0.0.0.0`

If you are running behind a domain, set:
- `WEB_ORIGIN="https://your-domain.com"`

**Do not expose port 4000 to the public.**

---

## 5) Start the stack (Docker)

```bash
docker compose -f docker-compose.demo.yml up -d --build
```

Check status:
```bash
docker compose -f docker-compose.demo.yml ps
```

View logs:
```bash
docker compose -f docker-compose.demo.yml logs -f web

docker compose -f docker-compose.demo.yml logs -f api

docker compose -f docker-compose.demo.yml logs -f worker
```

---

## 6) Domain + SSL (recommended)

Put a reverse proxy (Nginx or Caddy) in front of web:

### Nginx example
```
server {
  server_name your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

### Caddy example
```
your-domain.com {
  reverse_proxy 127.0.0.1:3000
}
```

Web already proxies `/api/*` internally, so you **do not** need a public API proxy.

---

## 7) First-time setup (Setup Code)

Haulio uses a **Setup Code** to create the first org.

Generate a setup code on the server:
```bash
pnpm setupcode:create
```

Open the app, go to `/setup`, enter the code, and complete the onboarding.

---

## 8) Basic health checks

### API
```bash
curl http://127.0.0.1:4000/health
```

### Web
Open:
```
http://localhost:3000
```

---

## 9) Troubleshooting

### A) “API unreachable” in browser
Cause: Browser cannot access port 4000 directly.
Fix: We proxy via `/api`, so make sure:
- `.env.docker` has `NEXT_PUBLIC_API_BASE="/api"`
- `API_BASE_INTERNAL="http://api:4000"`
- Rebuild web: `docker compose -f docker-compose.demo.yml up -d --build web`

### B) Teams Ops stuck on “Loading teams”
Cause: User context was loaded outside provider (fixed).
Fix: Rebuild web + hard refresh browser.

### C) Invalid payload on Admin settings
Cause: Invalid types (NaN or empty enum strings).
Fix: Ensure all numeric fields are numbers and enum fields are valid or blank. UI now sanitizes this.

### D) Puppeteer / Chromium error in API
Error: `Failed to launch the browser process` / `rosetta error`.
Fix:
- Dockerfile installs Chromium
- Env: `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
- API uses the env path

### E) Login issues / stale cookies
If you see login loops or 401s:
- Clear site cookies
- Hard refresh

---

## 10) Updating the server

```bash
git pull

docker compose -f docker-compose.demo.yml up -d --build
```

---

## 11) Backups

Postgres container is `demo-truckerio1-postgres-1`.
To back up:
```bash
pg_dump -U postgres -h localhost -p 5432 truckerio > haulio_backup.sql
```

---

## 12) If you need to reset demo data

If you want a fresh DB:
```bash
docker compose -f docker-compose.demo.yml down -v

docker compose -f docker-compose.demo.yml up -d --build
```

WARNING: This deletes all data.

---

## 13) What to check if something breaks

1) `docker compose ps`
2) `docker compose logs -f api`
3) `docker compose logs -f web`
4) Network tab → `/api/...` responses

---

## 14) Critical URLs

- App: `http://localhost:3000`
- Setup: `http://localhost:3000/setup`
- Dispatch: `http://localhost:3000/dispatch`
- Admin: `http://localhost:3000/admin`


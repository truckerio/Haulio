# Haulio Local Dev Guide (Docker‑first, Full Handoff)

This is the single handout for a new developer. It covers **how to run**, **how the system is structured**, **where to look**, and **how to debug + recover** when something breaks.

---

## 0) At a glance (what runs where)

**Services (Docker):**
- **web** (Next.js) — UI at http://localhost:3000
- **api** (Node + Express) — REST at http://localhost:4000
- **worker** (Node jobs)
- **postgres** (DB)
- **redis** (cache/queues)

**Key folders:**
- `apps/web` — UI (Next.js App Router)
- `apps/api` — API (Express + REST)
- `apps/worker` — background jobs
- `packages/db` — Prisma + migrations

---

## 1) Start everything (Docker)

```bash
docker compose -f docker-compose.demo.yml up --build
```

**Open:**
- Web: http://localhost:3000
- API: http://localhost:4000

To run in background:
```bash
docker compose -f docker-compose.demo.yml up --build -d
```

Stop everything:
```bash
docker compose -f docker-compose.demo.yml down
```

---

## 2) Database migrations

In Docker, the **API container automatically runs migrations** on startup:

```
pnpm --filter @truckerio/db exec prisma generate
pnpm --filter @truckerio/db exec prisma migrate deploy
```

If you add a new migration and need to apply it:
```bash
docker compose -f docker-compose.demo.yml up --build -d api
```

Check migration status:
```bash
docker compose -f docker-compose.demo.yml logs -f api
```

---

## 3) Reset demo data (without wiping the DB volume)

```bash
docker compose -f docker-compose.demo.yml exec api \
  pnpm --filter @truckerio/api tsx scripts/demo-reset.ts "Demo Org A"
```

Common org names:
- "Demo Org A"
- "Demo Transport LLC"

If you’re unsure which org exists, ask for a lookup script.

---

## 4) Full reset (wipe database)

```bash
docker compose -f docker-compose.demo.yml down -v
```

This removes the Postgres volume (`pgdata`). Next boot is a clean database.

---

## 5) Key flows to know

### Auth + Onboarding
- **Setup Code** gating: new orgs must be created via a valid setup code.
- **Setup route:** `/setup`
- After org exists, normal `/login` works.

### Dispatch Workbench
- `/dispatch` is the main dispatcher workbench.
- Left list = browse; right pane = assignment, stops, docs, tracking.
- **Assignment Assist** provides ranked suggestions (non‑blocking).

### Teams
- Teams exist with team assignments per entity.
- **Teams (Ops)** lets head dispatchers move loads between teams.

### Documents
- POD verify flows exist; verification rights are controlled by role permissions.

### Samsara
- Integration endpoints exist; testing endpoints in API handle validation + vehicle list.

---

## 6) Where to look (common edits)

**UI routes**
- Dispatch: `apps/web/app/dispatch/page.tsx`
- Loads list: `apps/web/app/loads/page.tsx`
- Load detail: `apps/web/app/loads/[id]/page.tsx`
- Today (dashboard): `apps/web/app/today/page.tsx`

**API**
- Main API: `apps/api/src/index.ts`
- Teams logic: `apps/api/src/modules/teams/*`
- Dispatch queue view: `apps/api/src/modules/dispatch/queue-view.ts`

**DB schema**
- `packages/db/prisma/schema.prisma`
- Migrations: `packages/db/prisma/migrations/*`

---

## 7) Common failures + fixes

### “API unreachable” (web error)
- API container not running or failed to boot.
```bash
docker compose -f docker-compose.demo.yml logs -f api
```

### Prisma P1001 (DB unreachable)
- Postgres container down or bad connection string.
```bash
docker compose -f docker-compose.demo.yml up -d postgres
```

### UI changes not showing
- Rebuild web container:
```bash
docker compose -f docker-compose.demo.yml up --build -d web
```

### Schema mismatch
- You changed schema but didn’t apply migration.
- Fix: rebuild api container (migrate deploy) or run migrate dev.

---

## 8) Basic verification checklist

1) Open http://localhost:3000
2) Login
3) Navigate to `/dispatch`
4) Assign a driver to a load
5) Verify POD (if role allows)
6) Create a new load from loads page

---

## 9) Role quick reference
- **ADMIN** — full access
- **HEAD_DISPATCHER** — ops/teams assignment but not team management
- **DISPATCHER** — dispatch workflow only
- **BILLING** — invoicing + docs
- **DRIVER** — driver portal

---

## 10) Debugging workflow (what to check first)

1) **Container status**
```bash
docker compose -f docker-compose.demo.yml ps
```

2) **API logs**
```bash
docker compose -f docker-compose.demo.yml logs -f api
```

3) **Web logs**
```bash
docker compose -f docker-compose.demo.yml logs -f web
```

4) **DB status**
```bash
docker compose -f docker-compose.demo.yml logs -f postgres
```

---

## 11) Useful commands (non-Docker)
If you run locally outside Docker:

```bash
pnpm --filter @truckerio/db exec prisma migrate dev
pnpm --filter @truckerio/api dev
pnpm --filter @truckerio/web dev
```

---

## 12) Handoff notes / product logic

**Dispatch Queue Views**
- Active = work queue
- Recent = last 90 days, read‑only
- History = all completed, read‑only

**Completed logic (backend)**
- `completedAt` set when status enters: DELIVERED, POD_RECEIVED, READY_TO_INVOICE, INVOICED, PAID, CANCELLED
- `completedAt` cleared if a load moves back to an active state

**Assignment Assist**
- Suggestions are non‑blocking
- Logs are created for recommendation + actual choice

---

If you want me to add architecture diagrams or an API route index, say the word.

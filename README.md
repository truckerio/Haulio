# Haulio Demo MVP

Back-office suite (Loads, Dispatch, Billing, Audit, Admin) with a zero-friction Driver portal.

## Scope

Ops OS includes:
- Loads/Open Load, Dispatch, Task Inbox/Today, Billing/Settlements, Driver Ops (next), Finance (planned).

Out of scope:
- Yard Storage / trailer yard inventory (YMS). This belongs to Yard OS.
- Any Yard UI must live in Yard OS and integrate only via minimal signals (e.g., trailer availability status), not a Storage UI.

## Setup

```bash
pnpm install
cp .env.example .env

docker-compose up -d
pnpm db:migrate
pnpm db:seed
```

## Run apps

```bash
pnpm dev:web   # Next.js on http://localhost:3000
pnpm dev:api   # Express API on http://localhost:4000
pnpm dev:worker # Task automation worker
```

## Reset for a new company

This wipes all data, clears uploads, and creates a fresh company + admin.

```bash
COMPANY_NAME="Your Company" \
ADMIN_EMAIL="admin@yourco.com" \
ADMIN_PASSWORD="change-me" \
pnpm company:reset
```

Optional overrides:
- `COMPANY_TIMEZONE`, `COMPANY_REMIT_TO`, `INVOICE_PREFIX`, `RESET_UPLOADS=false`
- `REQUIRED_DOCS` (comma list, e.g. `POD`) and `REQUIRED_DRIVER_DOCS` (e.g. `CDL,MED_CARD`)

## Docker demo (one-command)

1. Copy `.env.docker.example` to `.env.docker` and edit `WEB_ORIGIN` + `NEXT_PUBLIC_API_BASE` to match your server hostname.
2. Run:
   ```bash
   docker compose -f docker-compose.demo.yml up -d --build
   ```
3. Optional demo data (resets the DB):
   ```bash
   docker compose -f docker-compose.demo.yml exec api pnpm db:seed
   ```

## Render (Docker)

Use repo root as the build context for all services.

Web (Next.js):
- Build context: `.`
- Dockerfile: `Dockerfile.web`
- Docker command: `next start -p $PORT`
- Env: `NEXT_PUBLIC_API_BASE=https://<your-api-service>`

API (Node/Express):
- Build context: `.`
- Dockerfile: `Dockerfile.api`
- Docker command: `node apps/api/dist/index.js`
- Env: `API_PORT=$PORT`, `WEB_ORIGIN=https://<your-web-service>`, `DATABASE_URL=...`

Worker (Node):
- Build context: `.`
- Dockerfile: `Dockerfile.worker`
- Docker command: `node apps/worker/dist/index.js`
- Env: `DATABASE_URL=...`

## OCR for scanned confirmations (local)

The RC Inbox ("Load Confirmations") OCR fallback is fully local and requires
system tools:

```bash
sudo apt-get update
sudo apt-get install -y ocrmypdf tesseract-ocr poppler-utils
```

If these tools are missing, scanned PDFs/images will show a clear error and
remain reviewable manually.

## Custom local hostname (optional)

Example: `truckerio.local`

1. Add to `/etc/hosts`:
   ```
   127.0.0.1 truckerio.local
   ```
2. Update `.env`:
   ```
   WEB_ORIGIN="http://truckerio.local:3000"
   NEXT_PUBLIC_API_BASE="http://truckerio.local:4000"
   ```
3. Restart `pnpm dev:web` and `pnpm dev:api`

## Uploads

Files are stored locally in `uploads/`:
- `uploads/docs`
- `uploads/invoices`
- `uploads/packets`

## Demo users

- admin@demo.com / password123
- dispatch@demo.com / password123
- billing@demo.com / password123
- driver@demo.com / password123

## Demo flow

1. Dispatcher
   - Login as `dispatch@demo.com`
   - Go to `/loads` and create a load via the form
   - Go to `/dispatch` and assign driver/truck/trailer

2. Driver
   - Login as `driver@demo.com`
   - Open `/driver`
   - Tap Arrived Pickup → Departed Pickup → Arrived Delivery
   - Upload POD from camera/file picker

3. Billing
   - Login as `billing@demo.com`
   - Open `/billing`
   - Verify POD using checklist
   - Generate invoice and download PDF/packet

4. Admin/Dispatcher
   - Open `/dashboard` to see updated tasks
   - Open `/audit` to see action trail
   - Open `/admin` to create new driver logins quickly

## Bulk load import (CSV)

1. Fill the CSV templates:
   - `data/import/loads.csv`
   - `data/import/stops.csv`

The default layout supports three stops: Origin Yard (PICKUP), Destination Yard (PICKUP), Final Delivery (DELIVERY).

2. Run the importer:

```bash
pnpm --filter @truckerio/db exec tsx prisma/import-loads.ts
```

Optional: wipe existing loads before import:

```bash
pnpm --filter @truckerio/db exec tsx prisma/import-loads.ts --wipe
```

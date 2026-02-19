# Local Prod Troubleshooting

Use these fixes for both Mac and Windows.

## 1) Port already allocated

Error examples:
- `Bind for 0.0.0.0:4000 failed: port is already allocated`
- `Bind for 0.0.0.0:5433 failed: port is already allocated`
- `Bind for 0.0.0.0:6380 failed: port is already allocated`

Fix:
```bash
pnpm prod:local:down
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml down --remove-orphans
docker ps
```

Then start again:
```bash
pnpm prod:local
```

If another process still owns the port, stop that process or remap ports in `infra/docker/docker-compose.prod-local.yml`.

## 2) API starts but DB errors (`table does not exist`, missing column, etc.)

Typical cause: schema migrations were not applied in this database.

Run:
```bash
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml run --rm api pnpm --filter @truckerio/db exec prisma migrate deploy
```

If you get migration drift errors in local-only testing, fallback to reset + push:
```bash
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml exec postgres psql -U postgres -d haulio -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE EXTENSION IF NOT EXISTS citext;"
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml run --rm api pnpm --filter @truckerio/db exec prisma db push
```

## 3) `citext does not exist`

Run:
```bash
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml exec postgres psql -U postgres -d haulio -c "CREATE EXTENSION IF NOT EXISTS citext;"
```

Then re-run migration/db push command.

## 4) Login loop / immediate logout / repeated 401

Checklist:
1. Keep a stable `SESSION_SECRET` in `.env.prod.local` (do not rotate each restart).
2. Verify `WEB_ORIGIN` and `NEXT_PUBLIC_WEB_ORIGIN` match the URL you open.
3. If on LAN, include device URL in `CORS_ORIGINS`.
4. Clear browser site cookies/storage for the app domain.
5. Restart stack:
```bash
pnpm prod:local:down
pnpm prod:local
```

## 5) 429 Too Many Requests while login testing

Your login limiter is active. Wait for the limiter window or restart API container:
```bash
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml restart api
```

## 6) Web can open but setup check fails

Check service health and logs:
```bash
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml ps
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml logs api --tail=200
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml logs web --tail=200
```

Also verify:
```bash
curl http://localhost:4000/health
```

## 7) LAN device cannot reach host

1. Confirm host and device are on same network.
2. Use host IPv4 in browser: `http://<HOST_IP>:3000`.
3. Ensure local firewall allows inbound TCP `3000` and `4000`.
4. Some Wi-Fi networks block client-to-client traffic; test with hotspot/private LAN.

## 8) Recreate clean local prod state

This fully resets services and data volumes:
```bash
pnpm prod:local:down
docker volume rm prodlocal_pgdata prodlocal_uploads
pnpm prod:local
```

Then apply schema and seed again.

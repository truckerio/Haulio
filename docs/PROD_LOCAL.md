# Production-Like Local (Docker Compose)

This mode mirrors Railway-style containers with built artifacts and no hot reload.

Use the platform-specific setup guides:

- Unified runbook: `docs/LOCAL_PROD_SETUP.md`
- Mac: `docs/LOCAL_PROD_SETUP_MAC.md`
- Windows: `docs/LOCAL_PROD_SETUP_WINDOWS.md`
- Troubleshooting (both): `docs/LOCAL_PROD_TROUBLESHOOTING.md`

Quick start:

```sh
cp .env.prod.local.example .env.prod.local
pnpm prod:local
```

Open:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Postgres: `localhost:5433`
- Redis: `localhost:6380`

Stop:

```sh
pnpm prod:local:down
```

`.env.prod.local` is local-only and gitignored.

# Local dev database setup

This project expects a local Postgres database that your current OS user can own and reset.

Quick start:

```bash
# 1) Determine your local Postgres role (socket auth)
psql -t -d postgres -c "SELECT current_user;"

# 2) Create the dev database owned by that role
psql -d postgres -c "CREATE DATABASE haulio_dev OWNER <role>;"

# 3) Update .env and packages/db/.env to point to the new DB
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/haulio_dev"
```

Helper script (optional):

```bash
chmod +x scripts/setup-local-db.sh
scripts/setup-local-db.sh
```

Notes:
- If socket auth fails, specify host and user explicitly: `psql -h localhost -U <role> -d postgres`.
- If you need a different database name, pass it as the first arg to the script.

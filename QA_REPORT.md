# QA Report
Generated: 2026-01-23T09:46:42.829Z

## Summary
- Passed: 14
- Failed: 0
- Skipped: 0

## Automated Checks
- PASS qa.setup.docker — docker-compose up -d
- PASS qa.setup.db-ready — Postgres is ready
- PASS qa.setup.migrate — prisma migrate reset --force --skip-seed
- PASS qa.setup.seed — Seeded QA orgs/users
- PASS qa.tests.unit-integration — pnpm -r --if-present test (log: /Users/karanpreetsingh/demo-truckerio1/scripts/qa/qa-tests.log)
- PASS qa.smoke.multitenant — Org A cannot see Org B load
- PASS qa.smoke.rbac — RBAC enforcement ok
- PASS qa.smoke.load.lifecycle — Load delivered (DELIVERED)
- PASS qa.smoke.documents — POD verified, invoice cmkqp4z9l001wke07dd69e1sv 
- PASS qa.smoke.billing.queue — Load visible in billing queue
- PASS qa.smoke.invoicing — Invoice packet generated
- PASS qa.smoke.settlements — Settlement finalized and paid
- PASS qa.smoke.imports — CSV import preview + commit ok
- PASS qa.smoke.load.confirmations — Load confirmation created load cmkqp50zl002wke07u7o6jgji
## Logs

### scripts/qa/qa-tests.log
```
Scope: 5 of 6 workspace projects
```

### scripts/qa/qa-api.log
```
> @truckerio/api@0.1.0 dev /Users/karanpreetsingh/demo-truckerio1/apps/api
> tsx watch src/index.ts

API listening on 4010
```

## Manual UI Checks Remaining
- Login as dispatcher: create load, assign driver, verify load details summary strip + sticky sidebar.
- Documents/POD: upload POD, verify/reject flow visible in billing queue.
- Billing queue filters: Missing POD, Needs Verify, Verified, Rejected, Ready to Invoice.
- Invoice PDF: operating entity header + refs + pallet/weight fields show.
- Load confirmations: upload PDF/image, review draft, create load.
- Driver tracking: start tracking, verify last ping shows on load details.

## How To Run
- `pnpm qa:setup`
- `pnpm qa:tests`
- `pnpm qa:smoke`
- `pnpm qa:report`
- `pnpm qa:all`
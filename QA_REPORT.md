# QA Report
Generated: 2026-02-22T23:55:55.445Z

## Summary
- Passed: 15
- Failed: 0
- Skipped: 0

## Automated Checks
- PASS qa.setup.docker — docker-compose up -d
- PASS qa.setup.db-ready — Postgres is ready
- PASS qa.setup.migrate — prisma db execute reset + prisma db push
- PASS qa.setup.seed — Seeded QA orgs/users
- PASS qa.tests.unit-integration — pnpm -r --if-present test (log: /Users/karanpreetsingh/demo-truckerio1/scripts/qa/qa-tests.log)
- PASS qa.smoke.cleanup.assignments — Cleared assignments from 0 trip(s) for QA seed assets
- PASS qa.smoke.multitenant — Org A cannot see Org B load
- PASS qa.smoke.rbac — RBAC enforcement ok
- PASS qa.smoke.load.lifecycle — Load delivered (DELIVERED)
- PASS qa.smoke.documents — POD verified, invoice created via generate 
- PASS qa.smoke.billing.queue — Load visible in billing queue (delivered)
- PASS qa.smoke.invoicing — Invoice packet generated
- PASS qa.smoke.settlements — Settlement finalized and paid
- PASS qa.smoke.imports — CSV import preview + commit ok
- PASS qa.smoke.load.confirmations — Load confirmation created load cmlyeooa1006j4z5l6fkqsq78
## Logs

### scripts/qa/qa-tests.log
```
Scope: 5 of 6 workspace projects
. test$ pnpm test:billing && pnpm test:finance && pnpm test:payables
. test: > @truckerio/api@0.1.0 test:billing /Users/karanpreetsingh/demo-truckerio1/apps/api
. test: > node --import tsx src/lib/billing-readiness.test.ts
. test: billing readiness tests passed
. test: > @truckerio/api@0.1.0 test:finance /Users/karanpreetsingh/demo-truckerio1/apps/api
. test: > node --import tsx src/lib/finance-policy.test.ts && node --import tsx src/lib/finance-receivables.test.ts
. test: finance policy tests passed
. test: finance receivables tests passed
. test: > @truckerio/api@0.1.0 test:payables /Users/karanpreetsingh/demo-truckerio1/apps/api
. test: > node --import tsx src/lib/payables-engine.test.ts
. test: payables engine tests passed
. test: Done
```

### scripts/qa/qa-api.log
```
> @truckerio/api@0.1.0 dev /Users/karanpreetsingh/demo-truckerio1/apps/api
> TMPDIR=/tmp tsx watch src/index.ts

API listening on 0.0.0.0:4010
Billing readiness updated {
  loadId: 'cmlyeoljm000b4z5lw3ieytx2',
  billingStatus: 'BLOCKED',
  blockingReasons: [ 'Delivery incomplete', 'Invoice required before ready' ]
}
Billing readiness updated {
  loadId: 'cmlyeoljm000b4z5lw3ieytx2',
  billingStatus: 'BLOCKED',
  blockingReasons: [ 'Missing POD', 'Missing BOL', 'Invoice required before ready' ]
}
Billing readiness updated {
  loadId: 'cmlyeoljm000b4z5lw3ieytx2',
  billingStatus: 'BLOCKED',
  blockingReasons: [ 'Missing BOL', 'Invoice required before ready' ]
}
Billing readiness updated {
  loadId: 'cmlyeoljm000b4z5lw3ieytx2',
  billingStatus: 'INVOICED',
  blockingReasons: []
}
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
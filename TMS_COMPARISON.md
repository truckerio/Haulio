# Haulio vs Typical TMS — Product Comparison

## Current Haulio Feature Inventory (repo-based)

**Key routes/screens (apps/web)**
- Today / priority stack: `apps/web/app/today/page.tsx`
- Task Inbox (dashboard): `apps/web/app/dashboard/page.tsx`
- Loads list + refine: `apps/web/app/loads/page.tsx`
- Load details: `apps/web/app/loads/[id]/page.tsx`
- New load form: `apps/web/app/loads/new/page.tsx`
- Dispatch: `apps/web/app/dispatch/page.tsx`
- Billing queue: `apps/web/app/billing/page.tsx`
- Settlements (back-office): `apps/web/app/settlements/page.tsx`
- Driver portal: `apps/web/app/driver/page.tsx`
- Driver pay + settlements + profile: `apps/web/app/driver/pay/page.tsx`, `apps/web/app/driver/settlements/page.tsx`, `apps/web/app/driver/profile/page.tsx`
- Load confirmations inbox + detail: `apps/web/app/loads/confirmations/page.tsx`, `apps/web/app/loads/confirmations/[id]/page.tsx`
- Teams: `apps/web/app/teams/page.tsx`, `apps/web/app/teams/[teamId]/page.tsx`
- Audit log: `apps/web/app/audit/page.tsx`
- Admin settings (company/docs/integrations/automation/fleet/people): `apps/web/app/admin/page.tsx`, `apps/web/app/admin/company/page.tsx`, `apps/web/app/admin/documents/page.tsx`, `apps/web/app/admin/integrations/page.tsx`, `apps/web/app/admin/automation/page.tsx`, `apps/web/app/admin/fleet/page.tsx`, `apps/web/app/admin/people/employees/page.tsx`, `apps/web/app/admin/people/drivers/page.tsx`

**Key APIs (apps/api)**
- Auth/session: `/auth/login`, `/auth/me`, `/auth/logout`, `/auth/csrf` in `apps/api/src/index.ts`
- Setup/onboarding: `/setup/status`, `/setup/validate`, `/setup/consume-and-create-org` in `apps/api/src/index.ts`
- Loads lifecycle + detail: `/loads`, `/loads/:id`, `/loads/:id/dispatch-detail`, `/loads/:id/timeline` in `apps/api/src/index.ts`
- Dispatch support: `/dispatch/availability` in `apps/api/src/index.ts`
- Documents/POD: `/loads/:loadId/docs`, `/driver/docs`, `/docs/:id/verify`, `/docs/:id/reject` in `apps/api/src/index.ts`
- Load confirmations: `/load-confirmations/*` in `apps/api/src/index.ts`
- Tracking/visibility: `/tracking/load/:loadId/start|stop|ping|latest|history` in `apps/api/src/index.ts`
- Billing + invoices: `/billing/invoices/:loadId/generate`, `/billing/invoices/:invoiceId/status`, `/billing/invoices/:invoiceId/packet`, `/invoices/:id/pdf` in `apps/api/src/index.ts`
- Settlements: `/settlements`, `/settlements/:id`, `/settlements/generate`, `/settlements/:id/finalize`, `/settlements/:id/paid` in `apps/api/src/index.ts`
- Teams/admin: `/admin/users`, `/admin/drivers`, `/admin/teams`, `/teams/assign-loads` in `apps/api/src/index.ts`
- Integrations (Samsara): `/api/integrations/samsara/*` in `apps/api/src/index.ts`

**Key data models (Prisma)**
- Core: `Load`, `Stop`, `Driver`, `Truck`, `Trailer`, `Customer` in `packages/db/prisma/schema.prisma`
- Docs/POD: `Document`, `DocType`, `DocStatus` in `packages/db/prisma/schema.prisma`
- Billing/settlements: `Invoice`, `InvoiceItem`, `Settlement`, `SettlementItem` in `packages/db/prisma/schema.prisma`
- Task/alerts + audit: `Task`, `Event`, `AuditLog` in `packages/db/prisma/schema.prisma`
- Tracking: `LoadTrackingSession`, `LocationPing`, `TrackingIntegration` in `packages/db/prisma/schema.prisma`
- Org/teams/permissions: `Organization`, `OrgSettings`, `Team`, `TeamMember`, `TeamAssignment`, `User`, `Permission`, `Role` in `packages/db/prisma/schema.prisma`
- Load confirmations + learning: `LoadConfirmationDocument`, `LoadConfirmationExtractEvent`, `LoadConfirmationLearningExample` in `packages/db/prisma/schema.prisma`

## Executive Summary (decision‑oriented)

- ✅ Haulio already covers core load lifecycle, dispatch, POD, billing, and settlements in a clean, modern UI (`apps/web/app/loads/page.tsx`, `apps/web/app/dispatch/page.tsx`, `apps/web/app/billing/page.tsx`).
- ✅ Driver workflow exists with stop arrive/depart, POD upload, and earnings view (`apps/web/app/driver/page.tsx`, `apps/api/src/index.ts`).
- ✅ “Peace of mind” product concept is real: Today priority stack + Task Inbox focus users on exceptions instead of raw lists (`apps/web/app/today/page.tsx`, `apps/web/app/dashboard/page.tsx`).
- ✅ Load confirmations ingestion + review exists (upload, inbox, draft normalization), which many mid‑tier TMS tools treat as add‑ons (`apps/web/app/loads/confirmations/page.tsx`, `apps/api/src/index.ts`).
- 🟡 Tracking is present but limited (phone pings + partial Samsara integration); no broad ELD support yet (`apps/api/src/index.ts`).
- 🟡 Teams/permissions exist but look basic vs enterprise (role-based + teams; no granular role builder) (`apps/api/src/index.ts`, `packages/db/prisma/schema.prisma`).
- ❌ Reporting/analytics dashboards (KPI, margin, carrier scorecards) are not found; only task/ops views exist (`apps/web/app/dashboard/page.tsx`).
- ❌ Accounting integrations (QuickBooks, Netsuite), EDI/API partner integrations not present; only Samsara integration is visible (`apps/web/app/admin/integrations/page.tsx`, `apps/api/src/index.ts`).
- ❌ Compliance modules (DQs, driver qualification, IFTA, HOS compliance) are not found in code (assumption based on schema scan).
- ✅ Onboarding/setup flows exist and are simpler than typical TMS onboarding (`apps/web/app/setup/page.tsx`, `apps/web/app/onboarding/page.tsx`).
- 🟡 Import/export exists (CSV templates + load exports) but not a full TMS “master data import wizard” (`apps/web/components/ImportWizard.tsx`, `apps/api/src/index.ts`).
- ✅ Admin settings are consolidated into a clean “Settings” IA, which typical TMS tools lack (`apps/web/app/admin/page.tsx`).
- ✅ Audit trail + timeline per load exists (events + docs + invoices in timeline) (`apps/api/src/index.ts`).

**Prioritized next improvements (MVP/demo)**
1) Expand reporting: KPI cards (on‑time %, revenue, margin, POD aging) with export.
2) Strengthen integrations: at least one accounting export (CSV/QuickBooks) + a second telematics provider.
3) Operational exceptions: add automated alert rules + SLA timers visible in Today.
4) Data migration: guided CSV import for loads, customers, drivers, trucks, and trailers.
5) Permissions: admin‑configurable roles (basic role builder) or team‑level access rules.

## Feature Comparison Matrix

### A) Core Dispatch & Load Management

| Capability | Typical TMS expectation (baseline) | Haulio status | Evidence | Notes / next step |
| --- | --- | --- | --- | --- |
| Load creation/editing | Create/edit loads with stops, rates, status | ✅ Implemented | `apps/web/app/loads/new/page.tsx`, `apps/web/app/loads/[id]/page.tsx`, `/loads` in `apps/api/src/index.ts` | Solid baseline; could add bulk edit. |
| Load list + search/filter | Fast list, filters, statuses | ✅ Implemented | `apps/web/app/loads/page.tsx`, `/loads` in `apps/api/src/index.ts` | Good; global search now available in UI. |
| Dispatch assignment | Assign drivers/trucks/trailers | ✅ Implemented | `apps/web/app/dispatch/page.tsx`, `/dispatch/availability` in `apps/api/src/index.ts` | UI is strong; add optimization rules later. |
| Load timeline/audit | History of events/docs/status | ✅ Implemented | `/loads/:id/timeline` in `apps/api/src/index.ts` | Differentiator for clarity. |
| Rate confirmation ingestion | Upload + draft extraction | 🟡 Partial | `apps/web/app/loads/confirmations/page.tsx`, `/load-confirmations/*` in `apps/api/src/index.ts` | Present, but learning system is early. |
| Load export | Export loads to CSV | ✅ Implemented | `/loads/export` in `apps/api/src/index.ts` | Good for migration. |

### B) Driver App / Driver Workflow

| Capability | Typical TMS expectation (baseline) | Haulio status | Evidence | Notes / next step |
| --- | --- | --- | --- | --- |
| Driver portal | View loads + actions | ✅ Implemented | `apps/web/app/driver/page.tsx` | Covers primary workflow. |
| Stop updates (arrive/depart) | Driver can update stop status | ✅ Implemented | `/driver/stops/:stopId/arrive`, `/driver/stops/:stopId/depart` in `apps/api/src/index.ts` | Strong baseline. |
| POD upload | Driver uploads PODs | ✅ Implemented | `/driver/docs` in `apps/api/src/index.ts` | Good; could add mobile UX polish. |
| Driver profile/compliance fields | License, med card | 🟡 Partial | `apps/web/app/driver/profile/page.tsx`, `Driver` model in `packages/db/prisma/schema.prisma` | No DQ/compliance module. |
| Driver earnings/settlements | Earnings + settlement history | ✅ Implemented | `apps/web/app/driver/pay/page.tsx`, `/settlements` in `apps/api/src/index.ts` | Good baseline for demo. |

### C) Documents / POD

| Capability | Typical TMS expectation (baseline) | Haulio status | Evidence | Notes / next step |
| --- | --- | --- | --- | --- |
| Document upload (ops) | Upload POD/RateCon/etc | ✅ Implemented | `/loads/:loadId/docs` in `apps/api/src/index.ts` | Covers ops uploads. |
| Document upload (driver) | Mobile POD upload | ✅ Implemented | `/driver/docs` in `apps/api/src/index.ts` | Matches baseline. |
| Doc verify/reject | Billing verification workflow | ✅ Implemented | `/docs/:id/verify`, `/docs/:id/reject` in `apps/api/src/index.ts` | Good for billing flow. |
| Doc requirements | Required docs rules | 🟡 Partial | `apps/web/app/admin/documents/page.tsx`, `OrgSettings` in `packages/db/prisma/schema.prisma` | UI exists; needs enforcement per customer/load type. |

### D) Tracking / Visibility

| Capability | Typical TMS expectation (baseline) | Haulio status | Evidence | Notes / next step |
| --- | --- | --- | --- | --- |
| Manual/phone tracking | Driver ping flow | ✅ Implemented | `/tracking/load/:loadId/start|ping|stop` in `apps/api/src/index.ts` | Works for demo. |
| Telematics integration | ELD/telematics feed | 🟡 Partial | `/api/integrations/samsara/*` in `apps/api/src/index.ts` | Samsara only; add Motive/KeepTruckin. |
| Tracking visibility in UI | Tracking status on loads | 🟡 Partial | `apps/web/app/loads/[id]/page.tsx`, `apps/web/app/dispatch/page.tsx` | Limited map/geo UI not found. |

### E) Billing / Invoicing / Settlements

| Capability | Typical TMS expectation (baseline) | Haulio status | Evidence | Notes / next step |
| --- | --- | --- | --- | --- |
| Billing queue | Ready/missing POD workflow | ✅ Implemented | `apps/web/app/billing/page.tsx` | Solid baseline. |
| Invoice generation | Generate invoice + PDF | ✅ Implemented | `/billing/invoices/:loadId/generate`, `/invoices/:id/pdf` in `apps/api/src/index.ts` | Good for demo. |
| Invoice status updates | Sent/paid/disputed | ✅ Implemented | `/billing/invoices/:invoiceId/status` in `apps/api/src/index.ts` | Missing accounting sync. |
| Settlements | Generate/finalize/pay | ✅ Implemented | `/settlements/*` in `apps/api/src/index.ts` | Good baseline. |
| Accounting integration | QuickBooks/Netsuite | ❌ Missing | Not found in repo | Add CSV export or QB connector. |

### F) Teams / Permissions / Admin

| Capability | Typical TMS expectation (baseline) | Haulio status | Evidence | Notes / next step |
| --- | --- | --- | --- | --- |
| Roles + permissions | Role-based access | 🟡 Partial | `Role` + `Permission` in `packages/db/prisma/schema.prisma`, RBAC in `apps/api/src/index.ts` | Basic roles; no custom role builder. |
| Teams + assignment | Team scoping and assignments | ✅ Implemented | `Team`, `TeamAssignment` in `packages/db/prisma/schema.prisma`, `/admin/teams` in `apps/api/src/index.ts` | Good for multi‑team ops. |
| Admin settings | Company/docs/integrations/people | ✅ Implemented | `apps/web/app/admin/*` | Clean IA vs typical TMS. |
| Audit log | Audit trail | ✅ Implemented | `apps/web/app/audit/page.tsx`, `AuditLog` model in `packages/db/prisma/schema.prisma` | Good baseline. |

### G) Integrations

| Capability | Typical TMS expectation (baseline) | Haulio status | Evidence | Notes / next step |
| --- | --- | --- | --- | --- |
| Telematics | Samsara/Motive/etc | 🟡 Partial | `apps/web/app/admin/integrations/page.tsx`, `/api/integrations/samsara/*` in `apps/api/src/index.ts` | Samsara only. |
| Email (password reset) | SMTP reset | ✅ Implemented | `apps/api/src/lib/email.ts` | Good. |
| EDI/API partner | Customer/broker EDI | ❌ Missing | Not found in repo | Add EDI 204/214 or API integration. |

### H) Reporting / Analytics

| Capability | Typical TMS expectation (baseline) | Haulio status | Evidence | Notes / next step |
| --- | --- | --- | --- | --- |
| Operational KPIs | On‑time %, margin, utilization | ❌ Missing | No dedicated reporting routes found | Add reporting dashboard + exports. |
| Finance reports | A/R aging, revenue | ❌ Missing | Not found in repo | MVP: billing aging + invoice totals. |
| Driver performance | Safety/OTD/miles | 🟡 Partial | `apps/web/app/driver/pay/page.tsx` | Earnings only; no scorecards. |

### I) Data Import/Export + Onboarding

| Capability | Typical TMS expectation (baseline) | Haulio status | Evidence | Notes / next step |
| --- | --- | --- | --- | --- |
| Onboarding flow | Setup + defaults | ✅ Implemented | `apps/web/app/setup/page.tsx`, `apps/web/app/onboarding/page.tsx` | Good for quick start. |
| CSV import | Loads, drivers, fleet | 🟡 Partial | `apps/web/components/ImportWizard.tsx`, `data/import/*.csv` | Needs guided mapping for customers + drivers. |
| Export | CSV loads export | ✅ Implemented | `/loads/export` in `apps/api/src/index.ts` | Good baseline. |

## Haulio Differentiators (what’s uniquely better)

- **Priority‑stack UX**: Today screen turns operational chaos into a small, ranked set of actions (`apps/web/app/today/page.tsx`).
- **Calm, low‑friction admin**: Admin settings are a clean “Settings” IA rather than dense grids (`apps/web/app/admin/page.tsx`).
- **Progressive disclosure**: Load details expose billing + docs + timeline without forcing users into multiple modules (`apps/web/app/loads/[id]/page.tsx`).
- **Load confirmation ingestion**: Built‑in inbox + review is uncommon in mid‑tier TMS (`apps/web/app/loads/confirmations/page.tsx`).
- **Unified driver + back office**: Driver portal and ops share the same data models and workflows, reducing sync issues (`apps/web/app/driver/page.tsx`, `packages/db/prisma/schema.prisma`).

## Gaps that matter (demo/pilot blockers)

- **Reporting/analytics** (missing): MVP needs basic KPI cards (on‑time %, POD aging, revenue) and CSV export.
- **Accounting integration** (missing): MVP needs at least CSV export or QuickBooks Online connector.
- **Multi‑carrier/broker EDI** (missing): MVP could start with a minimal EDI 204/214 or API inbound loads.
- **Compliance/DQ** (missing): MVP version can be a driver compliance checklist with expiry alerts.
- **Role configurability** (partial): MVP should allow toggling permissions by role (not just fixed roles).

## Implementation Roadmap (short)

**30‑day demo‑ready (small set)**
- KPI dashboard + export (ops + billing).
- CSV import wizard for customers/drivers/fleet.
- Accounting export (CSV or QuickBooks).
- Exception alerts in Today (POD aging, tracking off, overdue stops).

**90‑day pilot‑ready (next set)**
- Multi‑provider telematics (Motive + Samsara).
- EDI/API inbound load ingestion.
- Role/permission editor + team‑level scoping UI.
- Compliance module (license/med card expirations, DQ checklist).


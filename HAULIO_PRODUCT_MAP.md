# Haulio Product Map (Repo-Grounded)

## 1) One-paragraph definition
Haulio is an operations console for trucking carriers that helps dispatch, billing, and leadership stay calm by surfacing the right exceptions and keeping loads moving from dispatch through documents and pay. It is built for small-to-mid carrier teams who need a single, low-stress view of loads, drivers, documents, and money without juggling multiple systems. It reduces ops stress by prioritizing what needs attention today, automating task creation (e.g., POD verification), and tying documents to billing and settlements. It is not a full “all-in-one TMS” or broker platform and does not claim complete accounting, compliance, or ELD/fuel-card functionality.

## 2) Core workflows (the “OS”)

### Today / priority view
- Roles: Admin, Head Dispatcher, Dispatcher (team view for Admin/Head Dispatcher).
- Entry: `apps/web/app/today/page.tsx` → `GET /today` and `GET /today/warnings/details` in `apps/api/src/index.ts`.
- Flow: user sees Blocks / Warnings / Info; can drill into warnings and jump to dispatch or loads.
- System assists: computes warning buckets and team breakdowns, drives attention outcomes via `/learning/attention-outcome`.
- Key objects: `Task`, `Load`, `Stop`, `Team`, `Event` in `packages/db/prisma/schema.prisma`.

### Loads list + load details
- Roles: Admin, Dispatcher, Billing.
- Entry: `apps/web/app/loads/page.tsx`, `apps/web/app/loads/[id]/page.tsx`.
- Flow: filter/search loads, view details, manage docs, export, create loads, bulk import.
- System assists: derives ops/billing status chips; exports via `/loads/export`.
- Key objects: `Load`, `Stop`, `Document`, `LoadCharge`, `OperatingEntity`, `Customer`.
- API: `/loads`, `/loads/:id`, `/loads/:id/charges`, `/loads/export`, `/loads/export/preview` in `apps/api/src/index.ts`.

### Dispatch workflow
- Roles: Admin, Dispatcher, Head Dispatcher.
- Entry: `apps/web/app/dispatch/page.tsx`, `apps/web/app/dispatch/manifest-panel.tsx`, `apps/web/app/dispatch/legs-panel.tsx`.
- Flow: queue view → pick load → assign driver/truck/trailer → update leg status; manifest building for trailers.
- System assists: availability lists, assignment suggestions, risk flags.
- Key objects: `Load`, `LoadLeg`, `Stop`, `Driver`, `Truck`, `Trailer`, `TrailerManifest`, `AssignmentSuggestionLog`.
- API: `/dispatch/availability`, `/loads/:id/assignment-suggestions`, `/loads/:id/assign`, `/loads/:id/unassign`, `/legs/:id/assign`, `/legs/:id/status`, `/manifests` in `apps/api/src/index.ts`.

### Driver app workflow (arrive/depart/POD)
- Roles: Driver.
- Entry: `apps/web/app/driver/page.tsx`, `apps/web/app/driver/profile/page.tsx`, `apps/web/app/driver/pay/page.tsx`, `apps/web/app/driver/settlements/page.tsx`.
- Flow: see current load + next action → arrive/depart → upload POD/docs → track compliance → view earnings/settlements.
- System assists: offline upload queue, compliance warnings, tracking ping status.
- Key objects: `Driver`, `Load`, `Stop`, `Document`, `Settlement`, `LoadTrackingSession`, `LocationPing`.
- API: `/driver/current`, `/driver/settings`, `/driver/stops/:stopId/arrive`, `/driver/stops/:stopId/depart`, `/driver/docs`, `/driver/earnings`, `/tracking/load/:loadId/latest` in `apps/api/src/index.ts`.

### Documents (POD/ratecon) + Document Vault
- Roles: Admin, Billing, Dispatcher (POD upload); Admin (Vault).
- Entry: PODs in `apps/web/app/loads/[id]/page.tsx` and Billing queue in `apps/web/app/billing/page.tsx`; Vault in `apps/web/app/admin/documents/vault/page.tsx`.
- Flow: upload POD/ratecon → verify/reject in billing → invoice readiness; Vault manages company/truck/driver documents with expirations.
- System assists: auto-creates verification tasks; status logic for expiring docs.
- Key objects: `Document`, `VaultDocument`, `Task`, `OrgSettings`.
- API: `/loads/:loadId/docs`, `/driver/docs`, `/docs/:id/verify`, `/docs/:id/reject`, `/admin/vault/docs`, `/admin/vault/stats`, `/admin/vault/docs/:id/download` in `apps/api/src/index.ts`.

### Billing / invoicing / settlements
- Roles: Admin, Billing.
- Entry: `apps/web/app/billing/page.tsx`, `apps/web/app/settlements/page.tsx`, `apps/web/app/driver/settlements/page.tsx`.
- Flow: verify PODs → mark invoice readiness → generate invoices → generate/finalize/mark paid settlements.
- System assists: queue filters, invoice PDF generation, settlement grouping.
- Key objects: `Invoice`, `InvoiceLineItem`, `Settlement`, `SettlementItem`, `Document`.
- API: `/billing/queue`, `/invoices/:id/pdf`, `/settlements`, `/settlements/generate`, `/settlements/:id/finalize`, `/settlements/:id/paid`.

### Teams
- Roles: Admin, Head Dispatcher; visibility for Dispatchers/Billing.
- Entry: `apps/web/app/teams/page.tsx`, `apps/web/app/teams/[teamId]/page.tsx`.
- Flow: see team load counts, assign loads to teams, manage team members (admin).
- System assists: team-scoped queues, team warnings on Today page.
- Key objects: `Team`, `TeamMember`, `TeamAssignment`.
- API: `/teams`, `/admin/teams`, `/admin/teams/assign`, `/teams/assign-loads`.

### Admin settings + onboarding/setup
- Roles: Admin.
- Entry: `apps/web/app/admin/page.tsx` and subpages (`company`, `automation`, `documents`, `integrations`, `fleet`, `people`), `apps/web/app/onboarding/page.tsx`, `apps/web/app/setup/page.tsx`.
- Flow: update company/billing fields, document rules, automation thresholds, integrations, fleet, people; onboarding steps and setup tokens.
- System assists: onboarding progress state, setup code validation.
- Key objects: `OrgSettings`, `OperatingEntity`, `SetupCode`, `OnboardingState`, `User`.
- API: `/admin/settings`, `/onboarding/state`, `/onboarding/*`, `/setup/status`, `/setup/validate`, `/setup/consume-and-create-org`.

### Integrations (Samsara)
- Roles: Admin.
- Entry: `apps/web/app/admin/integrations/page.tsx`, `apps/web/app/admin/integrations/samsara/fuel/page.tsx`.
- Flow: connect Samsara, map vehicles, view fuel usage summary, fetch live location for tracking.
- System assists: periodic fuel sync job, last sync health.
- Key objects: `TrackingIntegration`, `TruckTelematicsMapping`, `FuelSummary`, `LocationPing`.
- API: `/api/integrations/samsara/status`, `/api/integrations/samsara/connect`, `/api/integrations/samsara/vehicles`, `/api/integrations/samsara/map-truck`, `/admin/fuel/status`, `/admin/fuel/summary`.
- Worker: `apps/worker/src/samsara-fuel.ts`, scheduled in `apps/worker/src/index.ts`.

### Load confirmation ingestion (OCR + learning)
- Roles: Admin, Dispatcher.
- Entry: `apps/web/app/loads/confirmations/page.tsx`, `apps/web/app/loads/confirmations/[id]/page.tsx`.
- Flow: upload PDF/image → OCR/extract → review/edit draft → create load.
- System assists: OCR + heuristic extraction + learning examples.
- Key objects: `LoadConfirmationDocument`, `LoadConfirmationLearningExample`, `LearningExample`, `LearnedMapping`.
- API: `/load-confirmations/*` in `apps/api/src/index.ts`.
- Worker: `apps/worker/src/load-confirmations.ts`.

### Other implemented features not explicitly requested in the prompt
- Task Inbox / queue for exceptions: `apps/web/app/dashboard/page.tsx`, `/tasks/inbox`, `/tasks/assignees`, `/tasks/:id/assign`.
- Audit log: `apps/web/app/audit/page.tsx`, `/audit` endpoint, `AuditLog` model.
- Profile management + photo upload: `apps/web/app/profile/page.tsx`, `/profile`, `/profile/photo` endpoints, `User.profilePhotoUrl`.
- Storage check-in/out (admin-only): `/storage`, `/storage/checkin`, `/storage/:id/checkout`, `StorageRecord` model.

## 3) Feature inventory (grouped tables)

### A) Ops OS (Today/tasks/exceptions)
| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Today priority stack (blocks/warnings/info) | ✅ | `apps/web/app/today/page.tsx`, `/today`, `Task`, `Load` | Team view enabled for Admin/Head Dispatcher. |
| Warning drilldowns | ✅ | `/today/warnings/details`, `apps/web/app/today/page.tsx` | Loads listed by warning type. |
| Task inbox / role queue | ✅ | `apps/web/app/dashboard/page.tsx`, `/tasks/inbox`, `Task` | Assignment requires permission `TASK_ASSIGN`. |

### B) Loads/Dispatch
| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Load list + filters + export | ✅ | `apps/web/app/loads/page.tsx`, `/loads`, `/loads/export` | Export CSV; refine panel filters. |
| Load details + timeline | ✅ | `apps/web/app/loads/[id]/page.tsx`, `/loads/:id`, `/loads/:id/timeline` | Timeline uses audit/event data. |
| Dispatch queue + assignments | ✅ | `apps/web/app/dispatch/page.tsx`, `/loads/:id/assign`, `/dispatch/availability` | Assignment suggestions present. |
| Manifests + load legs | 🟡 | `apps/web/app/dispatch/manifest-panel.tsx`, `/manifests`, `TrailerManifest` | Present but likely ops-specific. |
| Load creation | ✅ | `apps/web/app/loads/new/page.tsx`, `/loads` (POST) | Requires onboarding operational state. |

### C) Driver
| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Driver current load + actions | ✅ | `apps/web/app/driver/page.tsx`, `/driver/current` | Arrive/depart endpoints. |
| Driver doc upload (POD) | ✅ | `/driver/docs`, `Document` | Offline upload queue in UI only. |
| Driver profile + photo | ✅ | `apps/web/app/driver/profile/page.tsx`, `/driver/profile`, `/driver/profile/photo` | Uses profile photo upload. |
| Driver pay snapshot + settlements | ✅ | `apps/web/app/driver/pay/page.tsx`, `/driver/earnings`, `/settlements` | Basic financial visibility. |

### D) Documents
| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Load docs upload (POD/Ratecon/etc.) | ✅ | `/loads/:loadId/docs`, `Document` | Admin/Dispatcher/Billing. |
| POD verification + rejection | ✅ | `apps/web/app/billing/page.tsx`, `/docs/:id/verify`, `/docs/:id/reject` | Billing gated. |
| Document Vault (org/truck/driver) | ✅ | `apps/web/app/admin/documents/vault/page.tsx`, `/admin/vault/docs`, `VaultDocument` | Expiration status + upload drawer. |
| Load confirmation OCR + draft | ✅ | `apps/web/app/loads/confirmations/*`, `/load-confirmations/*`, `LoadConfirmationDocument` | OCR tooling required on worker. |

### E) Billing/Finance
| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Billing queue (POD verification) | ✅ | `apps/web/app/billing/page.tsx`, `/billing/queue` | Status chips for POD state. |
| Invoice PDF generation | ✅ | `/invoices/:id/pdf`, `Invoice` | Packet ZIP generation in API. |
| Driver settlements | ✅ | `apps/web/app/settlements/page.tsx`, `/settlements/*`, `Settlement` | Generate/finalize/paid. |
| Full accounting/AR/AP | ❌ | N/A | Not present in repo. |

### F) Teams/Permissions/Admin
| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Roles + permissions | ✅ | `packages/db/prisma/schema.prisma` (Role), `apps/api/src/lib/permissions.ts` | Route guards in UI + API. |
| Team management | ✅ | `/admin/teams*`, `Team`, `TeamMember`, `TeamAssignment` | Ops team view page in UI. |
| Admin settings | ✅ | `apps/web/app/admin/*`, `/admin/settings` | Company, docs, automation, fleet, people. |
| Audit log | ✅ | `apps/web/app/audit/page.tsx`, `/audit`, `AuditLog` | Admin/Dispatcher/Billing view. |

### G) Integrations
| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Samsara connection + vehicle mapping | ✅ | `/api/integrations/samsara/*`, `TrackingIntegration`, `TruckTelematicsMapping` | Token stored in configJson. |
| Live location (Samsara) | 🟡 | `/tracking/load/:loadId/latest`, `LocationPing` | Uses mapping + token when tracking. |
| Fuel usage summary | ✅ | `/admin/fuel/status`, `/admin/fuel/summary`, `FuelSummary` | Worker sync every 6h. |
| ELD / fuel card purchase data | ❌ | N/A | Not implemented. |

### H) Reporting/Exports
| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Loads export (CSV) | ✅ | `/loads/export`, `apps/web/app/loads/page.tsx` | Date range filters supported. |
| Task filtering | ✅ | `/tasks/inbox`, `apps/web/app/dashboard/page.tsx` | Filters by status/priority/type. |
| Analytics dashboards | ❌ | N/A | No BI/dashboard beyond tasks/today. |

### I) Onboarding/Setup
| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Setup code validation | ✅ | `/setup/status`, `/setup/validate`, `/setup/consume-and-create-org` | Setup token flow. |
| Onboarding steps + activation | ✅ | `/onboarding/state`, `/onboarding/complete-step`, `/onboarding/activate` | Admin-only. |
| Password reset | ✅ | `/auth/forgot`, `/auth/reset`, `apps/web/app/forgot/page.tsx` | Email configurable. |

## 4) Architecture map (high level)
- Services:
  - `apps/web` (Next.js App Router UI) → routes under `apps/web/app/*`.
  - `apps/api` (Express API) → all endpoints in `apps/api/src/index.ts`.
  - `apps/worker` (background jobs) → `apps/worker/src/index.ts`.
  - `packages/db` (Prisma + Postgres schema/models).
- Data flow:
  - Browser → `apps/web` → API via `apiFetch` (`apps/web/lib/api.ts`) → Postgres models in `packages/db/prisma/schema.prisma`.
  - Worker reads/writes DB and calls external APIs (Samsara) and OCR utilities (`apps/worker/src/load-confirmations.ts`).
  - Uploads stored in local volume via `apps/api/src/lib/uploads.ts` (e.g., `/app/uploads`).
- Auth + roles:
  - API enforcement via `requireAuth`, `requireRole`, `requirePermission` in `apps/api/src/lib/auth.ts`, `apps/api/src/lib/rbac.ts`, `apps/api/src/lib/permissions.ts`.
  - UI gating via `RouteGuard` and `NoAccess` in `apps/web/components/rbac/*` and `useUser` in `apps/web/components/auth/user-context.tsx`.

## 5) Demo script outline (5–7 minutes)
1) **Login + Today view**
   - Route: `/today` (`apps/web/app/today/page.tsx`).
   - Show: blocks/warnings/info, team vs company focus. Emphasize “calm priority stack.”
2) **Dispatch queue + assignment**
   - Route: `/dispatch` (`apps/web/app/dispatch/page.tsx`).
   - Show: load queue, availability, assignment suggestions, risk flags.
3) **Load details + documents**
   - Route: `/loads/:id` (`apps/web/app/loads/[id]/page.tsx`).
   - Show: stops, status, upload docs, timeline.
4) **Billing queue → invoice readiness**
   - Route: `/billing` (`apps/web/app/billing/page.tsx`).
   - Show: POD verify/reject, ready-to-invoice flow.
5) **Driver experience**
   - Route: `/driver` (`apps/web/app/driver/page.tsx`).
   - Show: next action, arrive/depart, POD upload, tracking ping.
6) **Document Vault + Integrations**
   - Route: `/admin/documents/vault` and `/admin/integrations`.
   - Show: expiring documents, upload doc to company/truck/driver; Samsara status + fuel summary.
7) **Peace-of-mind close**
   - Return to `/today`: explain how tasks + doc status + dispatch risks roll into a daily “ops calm” view.

## Notes on verification
All capabilities above are tied to explicit routes/endpoints/models in the repo. Anything not referenced is UNKNOWN by design.

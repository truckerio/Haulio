# Admin Settings Audit

## Overview
Admin Settings is implemented as a single Next.js App Router page at `/admin` with two view modes:
- **Settings view (default)**: a settings-style layout with a left anchor sidebar and section anchors.
- **Classic admin view**: the older accordion-style layout, toggled via `?view=classic`.

Both modes share the same data sources and mutations; they are toggled by query param and conditional rendering in the same file.

## Routes
**Settings home**
- Route: `/admin`
- File: `apps/web/app/admin/page.tsx`
- Default view mode: settings-style UI

**Classic admin**
- Route: `/admin?view=classic`
- File: `apps/web/app/admin/page.tsx`
- Toggled by query param `view=classic`

**Section anchors (not separate routes; same `/admin` page)**
- Company: `#company` (settings view)
- Documents: `#documents` (settings view)
- Automation & Integrations: `#automation` (settings view)
- Fleet: `#fleet` (settings view)
- Permissions & People: `#people` (settings view)

There are **no separate subroutes** for people, documents, integrations, or fleet; all sections live in `apps/web/app/admin/page.tsx`.

## Navigation & Entry Points
**Admin navigation entry**
- Sidebar/nav is defined in `apps/web/components/app-shell.tsx`.
- `navSections` includes an **Admin** section with `href: "/admin"`.
- Visibility is controlled by `getVisibleSections()` based on role (`ADMIN` includes `/admin` in `roleRoutes`).

**Entry links into Admin**
- App shell nav: `apps/web/components/app-shell.tsx`.
- Onboarding completion links to `/admin`: `apps/web/app/onboarding/complete/page.tsx`.
- Teams page links to `/admin`: `apps/web/app/teams/page.tsx`.

**Settings vs Classic toggle**
- Implemented in `apps/web/app/admin/page.tsx`.
- Uses `useSearchParams()` and `useRouter()` to read/write `view=classic`.
- Default is settings view; classic view is enabled when `view=classic` is present.

## Pages & Component Trees
All sections are rendered inside:
- `AppShell` → `RouteGuard` → page header + view toggle
- `RouteGuard allowedRoles={['ADMIN']}` in `apps/web/app/admin/page.tsx`
- Data is loaded on mount via `loadData()` (see **Data Sources / Hooks** below)

### Settings view (default, `/admin`)
Layout:
- `AppShell` → `RouteGuard` → header
- Settings layout grid with left anchor sidebar and right content
- Each section is a `<details>` block with an `id` anchor

**Company (`#company`)**
- Component tree:
  - `<details id="company">` → `<summary>`
  - `<Card>` Company form (display name, invoice fields, remit-to)
  - `<Card>` Numbering (load/trip sequences)
  - `<Card>` Operating entities (list + edit/add form)
  - `<Card>` Customers (list + edit/add form)
- Key UI components:
  - `Card`, `FormField`, `Input`, `Select`, `Button`, `CheckboxField`, `EmptyState`
- Data sources/hooks:
  - `settingsDraft` from `/admin/settings`
  - `sequenceDraft` from `/admin/sequences`
  - `operatingEntities` from `/api/operating-entities`
  - `customers` from `/customers`
  - `saveOperatingEntity`, `makeDefaultEntity`, `saveCustomer`, `updateSettings`, `updateSequences`

**Documents (`#documents`)**
- Component tree:
  - `<details id="documents">` → `<summary>`
  - `<Card>` POD checklist
  - `<Card>` Required docs (invoice + driver docs)
  - `<Card>` Dispatch rules
- Key UI components:
  - `Card`, `CheckboxField`, `FormField`, `Input`
- Data sources/hooks:
  - `settingsDraft` from `/admin/settings`
  - Updates saved via `updateSettings`

**Automation & Integrations (`#automation`)**
- Component tree:
  - `<details id="automation">` → `<summary>`
  - `<Card>` Automation thresholds
  - `<Card>` Driver pay
  - `<Card>` Tracking preference
  - `<Card>` Settlement defaults
  - `<Card>` Integrations (Samsara status + connect/disconnect + truck mappings)
  - `<Card>` Bulk load import
- Key UI components:
  - `Card`, `FormField`, `Input`, `Select`, `CheckboxField`, `Button`
- Data sources/hooks:
  - `settingsDraft` from `/admin/settings`
  - `samsaraStatus` from `/api/integrations/samsara/status`
  - `truckMappings` from `/api/integrations/samsara/truck-mappings`
  - `trucks` from `/admin/trucks`
  - `connectSamsara`, `disconnectSamsara`, `saveTruckMapping`, `runImport`

**Fleet (`#fleet`)**
- Component tree:
  - `<details id="fleet">` → `<summary>`
  - `<Card>` Trucks (list + edit/add form)
  - `<Card>` Trailers (list + edit/add form)
  - `<ImportWizard>` trucks
  - `<ImportWizard>` trailers
- Key UI components:
  - `Card`, `FormField`, `Input`, `Select`, `Button`, `CheckboxField`, `ImportWizard`
- Data sources/hooks:
  - `trucks` from `/admin/trucks`
  - `trailers` from `/admin/trailers`
  - `saveTruck`, `saveTrailer`, `editTruck`, `editTrailer`
  - `ImportWizard` uses `/imports/preview` + `/imports/commit` (see API Calls)

**Permissions & People (`#people`)**
- Component tree:
  - `<details id="people">` → `<summary>`
  - `<Card>` Create employee login
  - `<Card>` Create driver login
  - `<ImportWizard>` employees
  - `<Card>` Invite new employees (after import)
  - `<ImportWizard>` drivers
  - `<Card>` Users list (role change, invite, deactivate/reactivate)
  - `<Card>` Drivers list (status, archive/restore)
- Key UI components:
  - `Card`, `FormField`, `Input`, `Select`, `Button`, `CheckboxField`, `ImportWizard`
- Data sources/hooks:
  - `users` from `/admin/users`
  - `drivers` from `/admin/drivers`
  - `employeeForm` + `createEmployee`
  - `driverForm` + `createDriver`
  - `employeeInvites` from `/users/invite-bulk`

### Classic admin view (`/admin?view=classic`)
Layout:
- Same page file, `apps/web/app/admin/page.tsx`
- Accordion `<details>` sections stacked vertically (no left anchor sidebar)

Notable differences vs settings view:
- Includes a **Teams** management card (create team, add/remove team members) in the “Company” section.
- Uses the original order/structure of cards (Company → Documents → Automation & Integrations → Fleet → Permissions & People).
- Manual employee creation is also present here (same card as settings view).

Data sources and API calls are shared with settings view (same hooks and helper functions).

## Users Management
**User list component**
- Location: `apps/web/app/admin/page.tsx`
- Section: “Permissions & People” → “Users” card

**Actions and API endpoints**
- **Create employee login**
  - UI: “Create employee login” card
  - File: `apps/web/app/admin/page.tsx`
  - Endpoint: `POST /admin/users`
  - Payload: `{ email, name, role, password }`
- **Create + copy invite**
  - UI: “Create + copy invite” button
  - Endpoint sequence:
    - `POST /admin/users` (same payload as above)
    - `POST /users/invite-bulk` with `{ userIds: [newUserId] }`
- **Copy invite (existing user)**
  - UI: “Copy invite” button in Users list
  - Endpoint: `POST /users/invite-bulk`
  - Payload: `{ userIds: [userId] }`
- **Deactivate / Reactivate**
  - UI: “Deactivate” / “Reactivate” buttons in Users list
  - Endpoints:
    - `POST /admin/users/:id/deactivate`
    - `POST /admin/users/:id/reactivate`
- **Role change**
  - UI: Role `<Select>` in Users list
  - Endpoint: `PATCH /admin/members/:memberId/role`
  - Payload: `{ role }`

## API Calls
Primary data fetches (on mount via `loadData()`):
- `GET /admin/settings`
- `GET /admin/sequences`
- `GET /admin/users`
- `GET /admin/teams`
- `GET /admin/drivers`
- `GET /customers`
- `GET /api/operating-entities`
- `GET /api/integrations/samsara/status`
- `GET /api/integrations/samsara/truck-mappings`
- `GET /admin/trucks`
- `GET /admin/trailers`

Mutations (selected):
- `PUT /admin/settings` (payload built in `updateSettings()`)
- `PATCH /admin/sequences` (payload built in `updateSequences()`)
- `POST /admin/teams` (payload `{ name }`)
- `POST /admin/teams/:id/members` (payload `{ userId }`)
- `DELETE /admin/teams/:id/members/:userId`
- `POST /admin/users` (payload `{ email, name?, role, password }`)
- `PATCH /admin/members/:memberId/role` (payload `{ role }`)
- `POST /admin/users/:id/deactivate` / `POST /admin/users/:id/reactivate`
- `POST /admin/drivers` (payload `driverForm`)
- `POST /admin/drivers/:id/archive` / `POST /admin/drivers/:id/restore`
- `POST /admin/drivers/:id/status` (payload `{ status }`)
- `POST /admin/trucks` / `PATCH /admin/trucks/:id`
- `POST /admin/trailers` / `PATCH /admin/trailers/:id`
- `POST /admin/import/loads` (multipart form; loads + stops CSV)
- `POST /api/operating-entities` / `PATCH /api/operating-entities/:id`
- `POST /api/operating-entities/:id/make-default`
- `POST /api/integrations/samsara/connect` (payload `{ apiToken }`)
- `POST /api/integrations/samsara/disconnect`
- `POST /api/integrations/samsara/map-truck` (payload `{ truckId, externalId }`)
- `POST /customers` / `PUT /customers/:id`

ImportWizard shared calls (used in Admin for employees/drivers/trucks/trailers):
- `POST /imports/preview` (payload `{ type, csvText, mapping }`)
- `POST /imports/commit` (payload `{ type, csvText, importId, mapping }`)
- `POST /learning/import-mapping` (payload `{ headers, mapping }`, best-effort)

## Notes / Risks
- Admin Settings is a **single very large page** (`apps/web/app/admin/page.tsx`) with two parallel render paths (settings view and classic). Duplication increases risk of drift.
- Teams management appears **only in classic view**; settings view currently omits Teams.
- All sections rely on client-side `apiFetch` calls; there are no server actions for admin.
- Screenshot tooling is not configured in repo. `DESIGN_REVIEW_PACKET.md` notes “No UI screenshots captured in repo.”

## Screenshots
No automated screenshot tooling found. Suggested manual capture steps:
1. Run the web app.
2. Navigate to `/admin` (settings view) and `/admin?view=classic` (classic view).
3. Capture each section (Company, Documents, Automation & Integrations, Fleet, Permissions & People).

Known references:
- `DESIGN_REVIEW_PACKET.md` → “Screenshots” section explicitly notes screenshots are missing.

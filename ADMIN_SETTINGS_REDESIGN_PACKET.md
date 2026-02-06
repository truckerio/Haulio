# Admin Settings Redesign Packet

## 1) Current State Summary
Admin Settings is a **single App Router page** with two modes in the same file:
- **Settings view (default)**: anchor sidebar + section details on `/admin`.
- **Classic admin view**: accordion-heavy legacy layout on `/admin?view=classic`.

People management (Employees + Drivers) currently lives **inside the same `/admin` page** as forms + card lists. There are no dedicated subroutes for Employees/Drivers.

## 2) Route Map (with file paths)
Primary routes:
- `/admin` → `apps/web/app/admin/page.tsx` (settings view default)
- `/admin?view=classic` → `apps/web/app/admin/page.tsx` (classic view toggle)

Settings view anchors (same route, not subroutes):
- `#company` → Company/numbering/entities/customers
- `#documents` → POD + doc requirements
- `#automation` → automation thresholds + integrations
- `#fleet` → trucks/trailers + bulk import
- `#people` → employees + drivers + invites

Classic view sections (same `/admin` route, accordion):
- Company
- Documents
- Automation & Integrations
- Fleet
- Permissions & People
- Teams (only in classic view)

Navigation entry:
- Sidebar definition: `apps/web/components/app-shell.tsx`
- Admin entry link: `/admin` (Admin section)

Basic vs Classic toggle:
- Query param `view=classic` read via `useSearchParams()` in `apps/web/app/admin/page.tsx`.

## Visual Reference (screenshots)
No Storybook or screenshot tooling found. `DESIGN_REVIEW_PACKET.md` explicitly notes missing UI screenshots. Use manual capture.

Screenshot targets:
- `/admin` (settings view landing)
- `/admin#people` (People section with employee + driver forms)
- Employee login form (within `/admin#people`)
- Users list + Drivers list (within `/admin#people`)
- `/admin?view=classic` (classic admin layout)

Suggested capture steps:
1) Run the web app locally.
2) Navigate to each route above.
3) Capture full-page plus close-up of People section.

## 3) Component Map (by page)
### `/admin` (settings view)
File: `apps/web/app/admin/page.tsx`
- `AppShell` → `RouteGuard allowedRoles={['ADMIN']}` → page header + toggle button
- Layout: `grid` with left anchor sidebar + right content
- Sections are `<details>` blocks with `Card` components for each settings group

People section (settings view, `#people`):
- Cards:
  - Create employee login (form)
  - Create driver login (form)
  - ImportWizard employees
  - Invite new employees (post-import)
  - ImportWizard drivers
  - Users list (card list + role dropdown + invite/deactivate)
  - Drivers list (card list + status + archive/restore)

### `/admin?view=classic`
File: `apps/web/app/admin/page.tsx`
- Same data + handlers as settings view
- Accordion-style `<details open>` sections
- Includes Teams management card (create team + add/remove members)

Shared UI components used:
- `apps/web/components/app-shell.tsx`
- `apps/web/components/ImportWizard.tsx`
- `apps/web/components/ui/*` (Card, Button, Input, Select, Checkbox, FormField, EmptyState, ErrorBanner, SectionHeader)
- `apps/web/components/rbac/route-guard.tsx`

## 4) Current Behaviors (what works + what endpoints)
### Current behavior matrix
| Area | UI layout | Data sources | Primary mutations |
| --- | --- | --- | --- |
| Company | Cards + form fields | `/admin/settings`, `/admin/sequences`, `/api/operating-entities`, `/customers` | `PUT /admin/settings`, `PATCH /admin/sequences`, `POST/PATCH /api/operating-entities`, `POST/PUT /customers` |
| Documents | Cards + checklists | `/admin/settings` | `PUT /admin/settings` |
| Automation & Integrations | Cards + forms | `/admin/settings`, `/api/integrations/samsara/status`, `/api/integrations/samsara/truck-mappings` | `PUT /admin/settings`, `POST /api/integrations/samsara/connect`, `POST /api/integrations/samsara/disconnect`, `POST /api/integrations/samsara/map-truck` |
| Fleet | Cards + inline forms + ImportWizard | `/admin/trucks`, `/admin/trailers` | `POST/PATCH /admin/trucks`, `POST/PATCH /admin/trailers`, `/imports/*` |
| People | Cards + inline forms + ImportWizard | `/admin/users`, `/admin/drivers`, `/admin/teams` | `/admin/users/*`, `/admin/drivers/*`, `/users/invite-bulk`, `/imports/*`, `/admin/teams/*` |

Data load (on mount) in `apps/web/app/admin/page.tsx`:
- `/admin/settings` → `settings`, `settingsDraft`
- `/admin/sequences` → `sequence`, `sequenceDraft`
- `/admin/users` → `users`
- `/admin/teams` → `teams`
- `/admin/drivers` → `drivers`
- `/customers` → `customers`
- `/api/operating-entities` → `operatingEntities`
- `/api/integrations/samsara/status` → `samsaraStatus`
- `/api/integrations/samsara/truck-mappings` → `truckMappings`
- `/admin/trucks` → `trucks`
- `/admin/trailers` → `trailers`

### People management actions
Employees (users):
- Create employee: `POST /admin/users`
  - Payload: `{ email, name?, role, password }`
  - Response: `{ user }`
- Create + copy invite: `POST /admin/users` then `POST /users/invite-bulk`
  - Invite payload: `{ userIds: [userId] }`
  - Response: `{ invites: [{ userId, email, inviteUrl }] }`
- Copy invite for existing user: `POST /users/invite-bulk`
- Change role: `PATCH /admin/members/:memberId/role`
  - Payload: `{ role }`
  - Response: `{ user }`
  - Guard: cannot change own role
- Deactivate / Reactivate:
  - `POST /admin/users/:id/deactivate`
  - `POST /admin/users/:id/reactivate`
  - Response: `{ user }`

Drivers:
- Create driver login: `POST /admin/drivers`
  - Payload: `{ email, name, phone?, license?, licenseState?, licenseExpiresAt?, medCardExpiresAt?, payRatePerMile?, password }`
  - Response: `{ user, driver }`
- Update driver status: `POST /admin/drivers/:id/status`
  - Payload: `{ status }`
  - Response: `{ driver }`
  - Guard: ADMIN or DISPATCHER
- Archive / Restore driver:
  - `POST /admin/drivers/:id/archive`
  - `POST /admin/drivers/:id/restore`
  - Response: `{ driver }`
  - Guard: ADMIN only

Teams (classic view only):
- Fetch teams: `GET /admin/teams`
- Create team: `POST /admin/teams` with `{ name }`
- Add member: `POST /admin/teams/:id/members` with `{ userId }`
- Remove member: `DELETE /admin/teams/:id/members/:userId`

### Roles and permissions
Current roles (from `packages/db/prisma/schema.prisma`): `ADMIN`, `DISPATCHER`, `HEAD_DISPATCHER`, `BILLING`, `DRIVER`.

Admin Settings UI:
- Guarded by `RouteGuard allowedRoles={['ADMIN']}` in `apps/web/app/admin/page.tsx`.

Server guards (selected):
- Most admin settings endpoints require `requireRole('ADMIN')` in `apps/api/src/index.ts`.
- Driver status update allows `ADMIN` or `DISPATCHER` (`POST /admin/drivers/:id/status`).
- Role change blocks updating your own role.

UI behavior summary (People section):
- Users displayed in **card list** (not table)
- Drivers displayed in **card list** with “Show archived” checkbox
- No filters/search; no pagination; all rows rendered at once
- Driver login and employee login are **inline forms** within admin page

## 5) Gaps / Pain Points (based on current UI)
- Single mega-page is overloaded; people management is buried in `#people` section.
- No dedicated Employees/Drivers pages, no search, filters, or table layouts.
- Employee + Driver creation forms are inline, not contextual (no drawer or modal).
- Teams exist only in classic view; settings view has no Teams management.
- Role edit is limited to DISPATCHER/HEAD_DISPATCHER/BILLING; no visibility into teams from People list.
- No SSN fields at all; no admin-only data rules for sensitive fields.

## 6) Proposed Redesign IA (Apple-like)
### New Admin Settings structure
Left rail (settings-style):
- Company
- Documents
- Integrations & Automation
- Fleet
- People & Access
  - Employees
  - Drivers
- Advanced (Classic admin link)

Right content: Settings rows and grouped cards.
- Each row: title + description + current value/status + chevron.
- Clicking a row opens a detail panel/drawer or navigates to a subpage.

Classic admin:
- Keep **small secondary link**: “Open classic admin”
- Not the default; no view toggle button in the header

Wireframe sketch:
```
Admin Settings
┌──────────────────────────┬──────────────────────────────────────────────┐
│ Company                  │ Company settings                             │
│ Documents                │ - Company name        Acme Transport   >     │
│ Integrations & Automation│ - Invoice prefix      INV-            >     │
│ Fleet                    │ - Numbering           LD-/TR-          >     │
│ People & Access          │ - Operating entities  2                >     │
│   Employees              │ - Customers           14               >     │
│   Drivers                │                                                     
│ Advanced                 │                                               
└──────────────────────────┴──────────────────────────────────────────────┘
```

## 7) Proposed Employees & Drivers (tables, filters, drawers)
### Employees page (People & Access → Employees)
Table columns:
- Name
- Email
- Role
- Status (Active/Inactive)
- Phone
- Team (optional)
- Actions (invite, deactivate/reactivate, edit role)

Filters:
- Search (name/email)
- Role (Admin, Head Dispatcher, Dispatcher, Billing)
- Status (Active/Inactive)
- Team (if teams enabled)
- Sort (Name A–Z, Recently created, Role)

Actions:
- “Add” button with dropdown:
  - Add employee
  - Add driver
- Drawer for Add employee
  - Required: email, role, temp password
  - Optional: name, phone
  - “More details” accordion

### Drivers page (People & Access → Drivers)
Table columns:
- Name
- Phone
- Email (optional, linked user)
- Status
- Truck (optional)
- Actions (edit, archive/restore)

Filters:
- Search (name/phone/email)
- Status (Available/On Load/Unavailable)
- Team/terminal (optional)
- Sort (Name A–Z, Recently created)

Add driver drawer:
- Required: name, temp password
- Optional: email, phone, license, license state, license expiry, med card expiry, pay rate
- “More details” accordion

### Data model recommendation
Current state:
- Employees are `User` records with role `ADMIN | HEAD_DISPATCHER | DISPATCHER | BILLING`.
- Drivers are a separate `Driver` model with optional `userId` linked to a `User` with role `DRIVER`.

Recommendation:
- Reuse existing models; no schema change required for Employees/Drivers split.
- Keep `Driver` as source of driver-specific fields (license, med card, pay rate).

## 8) SSN Admin-only Policy (UI + API requirements)
Current state:
- No SSN or last4 fields exist in schema or UI.

Policy requirement:
- Add **SSN last4 only** (unless full SSN already exists later), admin-only visibility.
- Mask by default (e.g., `•••-••-1234`), show on admin reveal.
- Never show SSN in tables or list rows.

Recommended minimal data model change:
- Add `ssnLast4` to `Driver` (or a secure profile sub-record) rather than `User`.
- Ensure API only returns `ssnLast4` to ADMIN users; non-admin gets null.

## 9) Implementation Checklist (ordered)
### Risks + dependencies
- Admin Settings is a single file today (`apps/web/app/admin/page.tsx`); refactor risk if not staged carefully.
- People pages depend on `/admin/users`, `/admin/drivers`, `/admin/teams`, and `/users/invite-bulk` contracts.
- Team data only exists in classic view today; if used for filters, ensure teams are enabled and returned.
- Role guards are strict (`ADMIN` for most endpoints); any new UI must align with server guards.
- Driver status endpoint allows DISPATCHER; ensure UI does not expose admin-only actions to non-admins.
- SSN last4 addition requires migration + API filtering; avoid exposing in list responses.

### Checklist
1) **Routing + layout**
   - Create new Admin Settings layout with left nav + right content.
   - Introduce dedicated routes:
     - `/admin` (settings overview)
     - `/admin/people/employees`
     - `/admin/people/drivers`
   - Files to create/edit (expected):
     - `apps/web/app/admin/page.tsx` (refactor into settings overview)
     - `apps/web/app/admin/people/employees/page.tsx`
     - `apps/web/app/admin/people/drivers/page.tsx`
     - `apps/web/components/admin-settings/*` (new shared nav/table/drawer components)
2) **Move People management out of mega-page**
   - Extract Employees/Drivers UI into new pages
   - Replace inline forms with drawers
   - Replace card lists with tables + filters
3) **Classic admin**
   - Keep `/admin?view=classic` accessible via small link
   - Remove the view toggle button from header
4) **People APIs / UI contracts**
   - Ensure tables consume `/admin/users` + `/admin/drivers`
   - Add server-side pagination or client-side pagination (decide)
5) **Teams integration**
   - Fetch `/admin/teams` for team filter + team column
6) **SSN policy**
   - Add `ssnLast4` to schema + migration
   - Guard API responses; admin-only return
   - UI masks + reveal for admins only
7) **Design tokens + components**
   - Build reusable table + filter bar + drawer forms
   - Reuse shadcn/Tailwind components

## 10) Final IMPLEMENT PROMPT (copy/paste)
```
You are OpenAI Codex working in my Haulio monorepo (pnpm). Implement the Admin Settings redesign described in ADMIN_SETTINGS_REDESIGN_PACKET.md.

Scope:
- Admin Settings + People management only.
- Build Apple-like settings IA with left nav + settings rows.
- Add dedicated Employees and Drivers pages with tables + filters + add drawers.
- Keep classic admin as a small secondary link to /admin?view=classic.
- Enforce SSN last4 policy (admin-only, masked, not in tables).

Constraints:
- Do not break existing Admin Settings APIs.
- Keep roles/permissions as they are today.
- Use Tailwind/shadcn components already present.

Deliverables:
- Update / create Next.js App Router pages under apps/web.
- Update any needed components.
- Update Prisma schema if SSN last4 required (only if not present).
- Provide a concise summary of changes and next steps.
```

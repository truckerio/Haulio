# Production-Ready Auth Recommendation (Invite-Only + SSO)

This document proposes a production-ready authentication and authorization design for Haulio.

## 1. Target Auth Policy

- **Invite-only enforcement**: Only users explicitly invited by an admin can access the system. Exact email match only; no open registration.
- **Primary login methods**: Microsoft Entra ID (OIDC) + Google (OIDC).
- **Optional fallback**: Email magic link for accounts without SSO.
- **Optional org restrictions**:
  - `allowedDomains[]` (e.g., `@haulio.us` only)
  - `microsoftTenantId` (lock to a single Entra tenant)
- **User lifecycle states**: `INVITED -> ACTIVE -> SUSPENDED` (and optional `DISABLED`).

## 2. Proposed Technical Architecture

### Web (NextAuth/Auth.js)

- **Providers**:
  - `AzureAD` provider (Microsoft Entra, OIDC)
  - `Google` provider (OIDC)
  - `Email` provider (magic link, optional)
- **Session strategy**: `jwt` with short-lived access token (10–30 minutes).
- **Callbacks**:
  - `signIn`: enforce invite-only (email must match an active invite or active user).
  - `jwt`: embed `sub`, `orgId`, `role`, `status`.
  - `session`: expose `orgId` and `role` to the UI.
- **Token safety**:
  - Keep JWT payload minimal; do not include PII beyond `sub` and `orgId`.
- **CSRF**: NextAuth includes its own CSRF protection on `/api/auth/*` endpoints (expected) :contentReference[oaicite:0]{index=0}

### API (Bearer JWT verification + org scoping)

- **Authorization**: Require `Authorization: Bearer <jwt>` on all protected routes.
- **Verification**: Use `NEXTAUTH_SECRET` (or a dedicated API JWT secret) to verify the token signature.
- **Middleware**:
  - Parse JWT, verify expiry, and attach `req.auth = { userId, orgId, role, status }`.
  - Reject requests without token or with `status !== ACTIVE`.
- **Org scoping**:
  - Use `req.auth.orgId` for all org-scoped queries.
  - Refuse cross-org access even if IDs match in the URL.

### Web-to-API Calls

- **Server-side fetch preferred**: Use server components or server actions to call the API with the Bearer token.
- **Client-side fetch**:
  - Option 1: Add a `/api/proxy/*` route in the web app that injects the Bearer token.
  - Option 2: Expose a short-lived `accessToken` in the NextAuth session and attach it in `apiFetch`.

## 3. Required Schema Changes

### Reshape invites to be **email-first**

Current `UserInvite` is userId-linked; for invite-only + SSO, it should be email-first:

- `UserInvite`
  - `orgId`
  - `email` (lowercased)
  - `tokenHash` (sha256)
  - `expiresAt`
  - `acceptedAt`
  - `invitedByUserId` (nullable)

### User changes

- Add `status` enum: `INVITED | ACTIVE | SUSPENDED` (or `DISABLED`).
- Make `passwordHash` nullable (users can be SSO-only or invite-not-yet-accepted).
- Keep `orgId` FK and unique email strategy:
  - **Recommended**: global unique email to simplify invite-only + SSO.
  - **Alternative**: keep `@@unique([orgId, email])` and store `orgId` on invite links.

### Organization changes (optional)

- Add `slug` (unique), `allowedDomains[]`, and/or `microsoftTenantId` for policy enforcement.

## 4. Step-by-Step Migration Plan

### Phase 0 — Compatible Schema Additions
- Add new fields (`User.status`, nullable `passwordHash`, invite email fields).
- Create new tables or extend `UserInvite` without breaking existing endpoints.

### Phase 1 — New Invite Endpoints
- Add invite-by-email endpoints (create invite, validate invite, accept invite).
- Allow activation on invite acceptance (set `passwordHash` or link SSO).

### Phase 2 — NextAuth + JWT Bearer
- Add NextAuth route + providers.
- Update web to use NextAuth for login/session.
- Add API JWT middleware and enforce Bearer authentication.

### Phase 3 — Deprecate Old Session/CSRF for App Traffic
- Remove `/auth/login` usage from web.
- Keep legacy endpoints temporarily for rollback, then delete.

### Rollback Strategy
- Keep old session endpoints enabled during rollout.
- Feature-flag NextAuth usage on the web.
- Ability to revert to cookie-based auth if JWT verification fails.

## 5. File-by-File Proposed Changes

### Prisma / Database
- `packages/db/prisma/schema.prisma`
  - Add `User.status`, make `passwordHash` optional, reshape `UserInvite` to include `email`, `acceptedAt`.
- `packages/db/prisma/migrations/*`
  - New migration for schema updates.

### Web (Next.js)
- `apps/web/app/api/auth/[...nextauth]/route.ts`
  - NextAuth configuration, providers, callbacks.
- `apps/web/app/(auth)/login/page.tsx`
  - NextAuth sign-in UI for SSO + optional magic link.
- `apps/web/app/(auth)/accept-invite/page.tsx`
  - Invite acceptance flow.
- `apps/web/middleware.ts`
  - Protect `/admin` and other private routes.
- `apps/web/lib/api.ts`
  - Attach Bearer token to API calls.

### API (Express)
- `apps/api/src/middleware/auth.ts` (new)
  - Verify JWT, attach `req.auth`.
- `apps/api/src/index.ts`
  - Replace `requireAuth` usages with JWT auth middleware.
  - Ensure all org-scoped queries use `req.auth.orgId`.
- Optional: move SSO/Invite logic into a dedicated module folder.

### Docs/Config
- `docs/AUTH_SETUP.md`
  - Step-by-step for creating first org + owner and configuring OIDC providers.
- `.env` updates (both web + api)
  - `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AZURE_AD_CLIENT_ID`, etc.


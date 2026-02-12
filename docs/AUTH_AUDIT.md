# Login/Auth System Audit (Haulio)

This document describes how authentication and authorization work today in the Haulio monorepo, based on code inspection.

## 1. Current Architecture Summary

- Web login is a client-side form (`apps/web/app/page.tsx`) that calls the API endpoint `/auth/login` via `apiFetch` (`apps/web/lib/api.ts`).
- The API authenticates with email + password (bcrypt) and sets a **session cookie** plus a **CSRF cookie**. Sessions are stored in the database (`Session` model) and resolved by `requireAuth`.
- The web stores a CSRF token in localStorage and sends it in `x-csrf-token` for non-GET requests.
- Current user data is fetched from `/auth/me` and stored in a client `UserProvider` context.
- Route protection is **client-only** (`RouteGuard`); there is no `apps/web/middleware.ts`.
- CORS is enforced in the API using `WEB_ORIGIN` + `CORS_ORIGINS`, and credentials are enabled.

Evidence excerpts:

```ts
// apps/web/lib/api.ts
export function getCsrfToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("csrfToken") || "";
}

export async function apiFetch<T>(path: string, options: RequestInit = {}, retryOnCsrf = true): Promise<T> {
  ...
  res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/";
      return new Promise<T>(() => {});
    }
  ...
}
```

```ts
// apps/api/src/index.ts
app.post("/auth/login", loginLimiter, async (req, res) => {
  ...
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  ...
  const session = await createSession({ userId: user.id, ipAddress, userAgent: userAgent ? String(userAgent) : null });
  setSessionCookie(res, session.token, session.expiresAt);
  const csrfToken = createCsrfToken();
  setCsrfCookie(res, csrfToken);
  ...
});
```

```ts
// apps/api/src/lib/auth.ts
export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    expires: expiresAt,
  });
}
```

```ts
// apps/api/src/lib/csrf.ts
export function setCsrfCookie(res: Response, token: string) {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: IS_PROD,
  });
}
```

```ts
// apps/api/src/index.ts (CORS)
const explicitOrigins = Array.from(
  new Set(
    [process.env.WEB_ORIGIN, ...(process.env.CORS_ORIGINS || "").split(",")]
      .map((value) => value?.trim())
      .filter(Boolean),
  ),
);
...
cors({
  origin: allowed ? origin || true : false,
  credentials: true,
})(req, res, next);
```

## 2. Current Data Model

Relevant Prisma models (from `packages/db/prisma/schema.prisma`):

- **Organization**
  - `id`, `name`, `createdAt`
- **User**
  - `orgId` FK, `email` (`@db.Citext`)
  - `passwordHash` (required)
  - `role` enum: `ADMIN | DISPATCHER | HEAD_DISPATCHER | BILLING | DRIVER`
  - `isActive` boolean
  - `@@unique([orgId, email])` (email is unique per org, not global)
- **UserInvite**
  - `orgId`, `userId`, `tokenHash`, `expiresAt`, `usedAt`
  - Invites are tied to an existing **userId** (no email field)
- **PasswordReset**
  - `orgId`, `userId`, `tokenHash`, `expiresAt`, `usedAt`
- **Session**
  - `userId`, `tokenHash`, `expiresAt`, `lastUsedAt`, `revokedAt`, `revokeReason`

Evidence excerpts:

```prisma
// packages/db/prisma/schema.prisma
model User {
  id           String       @id @default(cuid())
  orgId        String
  email        String       @db.Citext
  passwordHash String
  role         Role
  ...
  isActive     Boolean      @default(true)
  ...
  @@unique([orgId, email])
}

model UserInvite {
  id        String   @id @default(cuid())
  orgId     String
  userId    String
  tokenHash String
  createdAt DateTime @default(now())
  expiresAt DateTime
  usedAt    DateTime?
  ...
}
```

Implications:

- Invite-by-email is not possible without creating a user record first.
- `passwordHash` is required, so users cannot exist in an “invited but no password yet” state.
- Email uniqueness is **per org**, but login searches by email only (see `/auth/login`), which triggers a “Multiple orgs found” error if the same email exists in multiple orgs.

## 3. Current API Surface Area (Auth + Admin)

Auth endpoints (all in `apps/api/src/index.ts`):

| Method | Path | Auth/CSRF | Input | Output | Web Usage |
| --- | --- | --- | --- | --- | --- |
| POST | `/auth/login` | public | `{ email, password }` | `{ user, csrfToken }` | `apps/web/app/page.tsx` |
| POST | `/auth/forgot` | public | `{ email }` | `{ message, resetUrl? }` | `apps/web/app/forgot/page.tsx` |
| POST | `/auth/reset` | public | `{ token, password }` | `{ message }` | `apps/web/app/reset/[token]/page.tsx` |
| GET | `/auth/me` | `requireAuth + requireRole` | none | `{ user, org }` | `apps/web/components/auth/user-context.tsx` |
| GET | `/auth/csrf` | `requireAuth + requireRole` | none | `{ csrfToken }` | `apps/web/components/auth-keepalive.tsx` + `apps/web/lib/api.ts` |
| POST | `/auth/logout` | `requireAuth + requireRole + requireCsrf` | none | `{ ok: true }` | `apps/web/components/auth/logout-button.tsx` |
| POST | `/auth/sessions/revoke` | `requireAuth + requireCsrf + requirePermission(ADMIN_SETTINGS)` | `{ sessionId? , userId? }` | `{ ok: true }` | not referenced in web |

Invite endpoints:

| Method | Path | Auth/CSRF | Input | Output | Web Usage |
| --- | --- | --- | --- | --- | --- |
| POST | `/users/invite-bulk` | `requireAuth + requirePermission(ADMIN_SETTINGS)` | `{ userIds: string[] }` | `{ invites: { userId, email, inviteUrl }[] }` | `apps/web/app/admin/people/employees/page.tsx` |
| GET | `/invite/:token` | public | none | `{ invite }` | `apps/web/app/invite/[token]/page.tsx` |
| POST | `/invite/:token/accept` | public | `{ password, name? }` | `{ ok: true }` | `apps/web/app/invite/[token]/page.tsx` |

Admin user endpoints:

| Method | Path | Auth/CSRF | Input | Output | Web Usage |
| --- | --- | --- | --- | --- | --- |
| GET | `/admin/users` | `requireAuth + requireRole(ADMIN)` | none | `{ users }` | `apps/web/app/admin/*` |
| POST | `/admin/users` | `requireAuth + requireCsrf + requireRole(ADMIN)` | `{ email, role, password, ... }` | `{ user }` | `apps/web/app/admin/people/employees/page.tsx` |
| POST | `/admin/users/:id/deactivate` | `requireAuth + requireCsrf + requireRole(ADMIN)` | none | `{ user }` | `apps/web/app/admin/people/employees/page.tsx` |
| POST | `/admin/users/:id/reactivate` | `requireAuth + requireCsrf + requireRole(ADMIN)` | none | `{ user }` | `apps/web/app/admin/people/employees/page.tsx` |
| PATCH | `/admin/members/:memberId/role` | `requireAuth + requireCsrf + requireRole(ADMIN)` | `{ role }` | `{ user }` | `apps/web/app/admin/people/employees/page.tsx` |

Evidence excerpts:

```ts
// apps/api/src/index.ts
app.post("/users/invite-bulk", requireAuth, requirePermission(Permission.ADMIN_SETTINGS), async (req, res) => {
  ...
  await prisma.userInvite.create({ data: { orgId, userId: user.id, tokenHash, expiresAt } });
  invites.push({ userId: user.id, email: user.email, inviteUrl: `${inviteBase}/invite/${token}` });
});
```

```ts
// apps/api/src/index.ts
app.post("/invite/:token/accept", async (req, res) => {
  ...
  await prisma.user.update({
    where: { id: invite.userId },
    data: { passwordHash, isActive: true, name: parsed.data.name ?? undefined },
  });
});
```

## 4. Current Web Surface Area

- **Login page**: `apps/web/app/page.tsx` renders email/password form and calls `apiFetch("/auth/login")`.
- **Invite acceptance**: `apps/web/app/invite/[token]/page.tsx` fetches `/invite/:token` then posts `/invite/:token/accept`.
- **Current user context**: `apps/web/components/auth/user-context.tsx` fetches `/auth/me` and stores user/org in client state.
- **Route protection**: `apps/web/components/rbac/route-guard.tsx` is client-only. There is no `apps/web/middleware.ts`.
- **API base**: `apps/web/lib/apiBase.ts` pulls `NEXT_PUBLIC_API_BASE` and trims trailing slashes.
- **CSRF handling**: localStorage (`csrfToken`) + `AuthKeepalive` refresh from `/auth/csrf`.

Evidence excerpts:

```ts
// apps/web/app/page.tsx
const data = await apiFetch<{ user: { role: string }; csrfToken: string }>("/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: nextEmail, password: nextPassword }),
});
setCsrfToken(data.csrfToken);
```

```ts
// apps/web/components/auth/user-context.tsx
const data = await apiFetch<{ user: CurrentUser; org?: { id: string; name: string } | null }>("/auth/me");
setUser(data.user ?? null);
```

```ts
// apps/web/components/auth-keepalive.tsx
const res = await fetch(`${getApiBase()}/auth/csrf`, { credentials: "include" });
```

## 5. Security Findings (Short + Actionable)

- **Cross-site cookie dependency** (Medium): Session/CSRF cookies are `SameSite=Lax`. If web and API are on different registrable domains (e.g., `vercel.app` + `railway.app`), browsers will not send cookies on XHR/fetch, causing auth failures.
- **Invite flow is userId-based** (Medium): Invites are tied to existing users and require the user to be created with a password first (`/admin/users`), which is not invite-only by email and is incompatible with SSO.
- **Email multi-org ambiguity** (Low/Med): `@@unique([orgId, email])` allows same email across orgs, but `/auth/login` fails with a “Multiple orgs found” message, leaking tenancy info.
- **Client-only route protection** (Low): No server-side guard in Next.js routes; security still relies on API checks, but UI routes can be accessed and render without data.
- **CSRF token in localStorage** (Low): CSRF token is stored in localStorage; an XSS would exfiltrate it (same risk as any XSS).

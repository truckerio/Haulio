# Auth Refactor Changeset Checklist

This checklist is intended to execute the invite-only password + MFA refactor safely.

## Checklist

- [ ] Apply Prisma migrations: `pnpm -w prisma:generate && pnpm -C packages/db prisma migrate deploy`.
- [ ] Seed dev org + admin: `pnpm -C packages/db prisma db seed`.
- [ ] Configure env vars:
  - Web: `NEXT_PUBLIC_API_BASE`.
  - API: `WEB_ORIGIN`, `CORS_ORIGINS`, `EMAIL_SERVER` + `EMAIL_FROM` (password reset), `MFA_SECRET` (or `APP_ENCRYPTION_KEY`), optional `MFA_ENFORCE_ADMIN=true`.
- [ ] Start services: `pnpm -C apps/api dev` and `pnpm -C apps/web dev`.
- [ ] Verify invites flow end-to-end (see smoke tests below).

## Acceptance Criteria

1) **Not invited -> cannot sign in** (generic error only, no enumeration).  
2) **Invited -> can sign in only as invited email** (invite link sets password).  
3) **/admin routes blocked** without authenticated session + admin role.  
4) **API rejects requests** without session cookie or missing CSRF header.  
5) **Org scoping enforced** in all DB queries (orgId from session user).  

## Smoke Tests

- Create invite: sign in as admin → `Admin → People → Employees` → create invite → copy link.
- Accept invite: open invite link, set name + password, then sign in at `/login`.
- Not invited: attempt login with a non-invited email and confirm generic error.
- Forgot password: submit `/forgot`, use reset link, confirm login with new password.
- MFA: enable 2FA in `/profile`, log out, log in again and confirm MFA prompt.
- Recovery codes: use a recovery code once (then it should not work again).
- Admin reset: reset MFA for a user in `Admin → People → Employees`, then log in without MFA.

# ADR-003: Identity, sessions and authorization model

- **Status:** Accepted (Phase 0); MFA/passkeys scheduled Phase 1
- **Date:** 2026-10-29
- **FDD references:** SEC-001, SEC-002, SEC-003, SEC-005, §20, §21.1, E.13

## Context

The FDD allows either an OIDC-compatible provider or an audited first-party auth stack, and
requires RBAC + ABAC, MFA for privileged users, short-lived sessions with rotation, lockout,
server-side authorization on every endpoint and background job, and audit of security events.

## Decision

### Identity (first-party, provider-pluggable)

- Phase 0 ships a **first-party** identity module: Argon2id password hashing, opaque
  server-side sessions stored in PostgreSQL (`sessions` table: hashed token, user, tenant,
  expiry, absolute expiry, device metadata, revoked_at), HttpOnly `SameSite=Strict` cookie for
  the web app, `Authorization: Bearer` for API clients. Access tokens are the session token
  itself (opaque, 256-bit random); there are no JWTs to leak claims or outlive revocation.
- Lockout after N failed attempts per account and per IP (configurable), constant-time
  comparison, no user-enumeration in error messages.
- The `IdentityProvider` port (`modules/identity/index.ts`) exposes `authenticate`,
  `createSession`, `resolveSession`, `revoke`. An OIDC adapter can implement the same port in
  Phase 5 without touching other modules.
- MFA (TOTP) and passkeys are Phase 1 deliverables; the `users` table already carries
  `mfa_enrolled_at` and sensitive actions declare `requiresMfa: true` in their permission
  metadata so enforcement is a single guard change.

### Authorization

- **Permissions** are strings `module.resource.action` (e.g. `crm.party.read`,
  `catalog.item.create`, `admin.role.manage`). They are declared in code
  (`packages/types/src/permissions.ts`) so the set is type-checked; unknown strings cannot be
  granted.
- **Roles** are tenant-scoped bundles of permissions. Seed roles follow FDD §20; tenants may copy
  and edit roles but not invent permissions.
- **Membership** links a user to a tenant with roles; **scope grants** (`user_scope_grants`)
  narrow a membership to specific companies, branches, warehouses, territories (ABAC). A
  membership with no company scope grant has access to **no** company — access is never
  implied.
- **Request context** (`RequestContext`) is built once per request: user, tenant, selected
  company (verified), effective permissions, scopes. Controllers declare
  `@RequirePermission('catalog.item.create')`; the guard also verifies the selected company is in
  the user's scope. Background jobs construct the same context from the job payload and are
  subject to the same checks.
- Revoking a role or session takes effect on the next request (`T-020`): effective permissions
  are read from the database per request (cached for the request only).

### Audit

- `audit_events` is append-only (no UPDATE/DELETE privilege for `aurora_app`; enforced by
  grants). Every security-sensitive action (login, logout, failed login, lockout, role change,
  scope change, entitlement change, pack install) writes an event with actor, subject, redacted
  before/after, request id, IP/user agent where lawful, and reason.

## Consequences

- No external identity dependency for the pilot; one well-tested module.
- Sessions are revocable instantly and listable per user (`logout-all`).
- Permission strings are compile-time checked; adding a resource means adding a line to one
  file and a migration seeding the role matrix.

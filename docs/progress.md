# Progress — what is real, what is not

Updated with every slice (FDD §26.2 step 10). Anything not listed under "Implemented" does
not exist, regardless of what a menu, ADR or manifest might suggest.

## Phase 0 — Platform foundation · COMPLETE (2026-10-29)

### Implemented and tested

| Area                | What works                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Evidence                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Tenancy & isolation | Tenants, memberships, roles (seeded from FDD §20 templates), permissions, company scope grants. RLS enabled + forced on all 24 tenant-owned tables; `aurora_app` role cannot bypass; composite FKs carry `tenant_id`.                                                                                                                                                                                                                                                               | `isolation.e2e-spec` (T-001, MI-018, SQL-level RLS proof), live RLS audit in `parties-and-access.e2e-spec`, `scripts/check-rls.ts` |
| Identity            | Argon2id passwords, opaque HMAC-hashed sessions with sliding + absolute expiry, lockout, logout / logout-all, generic credential errors, login across tenants (`tenant_required`)                                                                                                                                                                                                                                                                                                   | `parties-and-access.e2e-spec` (lockout, revocation T-020)                                                                          |
| Authorization       | Three global guards: Auth → Module (`404 MODULE_DISABLED`) → Permission + company scope (`403`, attempt audited, T-002). Permissions are code-declared, roles are data.                                                                                                                                                                                                                                                                                                             | `entitlements.e2e-spec`, `parties-and-access.e2e-spec`                                                                             |
| Legal entities      | Companies with code, base currency, country, fiscal-year start, accounting basis; scoped `/companies`                                                                                                                                                                                                                                                                                                                                                                               | `isolation.e2e-spec`                                                                                                               |
| Audit               | Append-only `audit_events` (no UPDATE/DELETE grant + trigger), redaction of credential-like keys, request id, actor, reason; admin listing with keyset pagination                                                                                                                                                                                                                                                                                                                   | `parties-and-access.e2e-spec`, `industry-packs.e2e-spec`                                                                           |
| Outbox              | `outbox_events` written in the same transaction as every state change (envelope per F-DATA-002); `processed_events` dedupe table                                                                                                                                                                                                                                                                                                                                                    | schema + grants; consumers are Phase 1                                                                                             |
| Entitlements        | Tenant-level module switch with audit + outbox; per-company `entity_capabilities` narrowing; deactivation guard registry; `/capabilities` returns modules, permissions, derived navigation and quick-create                                                                                                                                                                                                                                                                         | `entitlements.e2e-spec` (MI-004, MI-012), `navigation.spec`                                                                        |
| Industry packs      | 10 versioned manifests (one roadmap pack, not installable); preview diff; transactional install writing immutable `config_install_events`; removal retains history and keeps modules other packs still need                                                                                                                                                                                                                                                                         | `industry-packs.e2e-spec` (MI-011, F-PACK-10), `industry-pack.spec`                                                                |
| Parties             | One identity, many roles (`party_roles`), normalized name/email for search, status, tags, custom fields, If-Match optimistic concurrency, archive                                                                                                                                                                                                                                                                                                                                   | `parties-and-access.e2e-spec`                                                                                                      |
| Catalog             | 8 item kinds with capability flags; kind policy enforced in domain **and** by DB CHECK constraints; physical profile + barcodes only for physical kinds (trigger-guarded); services need nothing physical; stocked kinds require the inventory module; leading-zero barcodes; default UOMs; categories                                                                                                                                                                              | `catalog.e2e-spec` (MI-001, MI-009, MI-022, MI-024, T-022), `item.spec`, `item-kinds.test`                                         |
| Inventory surface   | Warehouse master behind `@RequireModule('inventory')` — exists to prove gating; no stock ledger                                                                                                                                                                                                                                                                                                                                                                                     | `entitlements.e2e-spec`                                                                                                            |
| Money               | `Money`/`Quantity` exact decimals, currency minor units (IQD = 3), half-even rounding, largest-remainder allocation                                                                                                                                                                                                                                                                                                                                                                 | `money.test`                                                                                                                       |
| Web                 | Next.js shell: login, entitlement-driven sidebar, company switcher, EN/AR with RTL, parties list/new/detail, items list/new/detail (kind-aware form), warehouses (module-gated), admin companies/members/modules+packs/audit. Production build passes.                                                                                                                                                                                                                              | `item-form.test` (MI-001 UI, MI-017), manual smoke through the Next rewrite                                                        |
| Independent review  | A separate read-only reviewer audited isolation, authorization, item-kind constraints, UI honesty, secret logging and module boundaries. Fixed: driver errors no longer log query parameters (`describeForLog`), audit redaction is recursive and case-insensitive, OpenAPI docs are off in production unless `OPENAPI_PUBLIC=true`, and every route must carry `@Public`, `@RequirePermission` or `@AuthOnly` (`route-coverage.e2e-spec`, proven to fail on a stripped decorator). | `audit.service.spec`, `exception.filter.spec`, `route-coverage.e2e-spec`                                                           |
| Engineering gates   | ESLint type-checked, dependency-cruiser boundaries (proved to catch a deep import), RLS lint, Prettier, CI workflow, local Postgres fallback                                                                                                                                                                                                                                                                                                                                        | `pnpm lint`                                                                                                                        |

### Not implemented (do not assume)

- No invoices, quotes, GL, journals, AR/AP, bank, tax, reports or exports — all Phase 1+.
  No `Money` is persisted yet; the primitive exists for Phase 1.
- No stock ledger, lots, bins, movements (Phase 2). `warehouses` is master data only.
- No outbox consumers; `apps/worker` is a scaffold that prints its status.
- No MFA/passkeys (columns reserved; Phase 1). No OIDC adapter (port exists).
- No custom-field definitions registry, workflow engine, approvals, notifications, documents.
- No branches/departments UI (tables exist). No party commercial profile fields beyond identity.
- Industry packs seed only modules, roles and item categories; COA examples, templates and
  dashboards arrive with their modules.
- Web: no edit forms for parties/items yet (create, view, archive, add role only); no
  command palette; no saved views; density toggle not persisted.

### Business assumptions still open (owner)

See `docs/decisions/open-questions.md` — all eight remain OPEN. Demo data is synthetic and
labelled DEMO. No tax rate, chart of accounts or valuation method has been assumed anywhere.

### Verification record (2026-10-29, local Postgres 16 as `aurora_app`)

```
$ pnpm lint
 Tasks:    11 successful, 11 total
✔ no dependency violations found (122 modules, 410 dependencies cruised)
RLS lint passed: 24 tenant-owned tables covered.

$ pnpm typecheck
 Tasks:    11 successful, 11 total

$ pnpm test
@aurora/types:test:       Tests  23 passed (23)
@aurora/api:test:         Tests  18 passed (18)
@aurora/web:test:         Tests  4 passed (4)

$ pnpm test:e2e
 ✓ test/e2e/parties-and-access.e2e-spec.ts (10 tests)
 ✓ test/e2e/isolation.e2e-spec.ts (9 tests)
 ✓ test/e2e/catalog.e2e-spec.ts (10 tests)
 ✓ test/e2e/entitlements.e2e-spec.ts (6 tests)
 ✓ test/e2e/industry-packs.e2e-spec.ts (6 tests)
 ✓ test/e2e/route-coverage.e2e-spec.ts (1 test)
 Test Files  6 passed (6)
      Tests  42 passed (42)

$ pnpm --filter @aurora/web build
 ✓ Compiled successfully — 15 routes
```

Manual smoke (API :4000 + web :3000, browser path through the Next rewrite): login sets the
HttpOnly cookie; `/home` renders; `/capabilities` for the service-only company returns the five
core modules and a navigation without inventory; `/warehouses` answers `404 MODULE_DISABLED`;
a SERVICE item is created with no physical attributes; `<html lang="ar" dir="rtl">` with
`aurora_locale=ar`; OpenAPI at `/api/v1/openapi.json` lists 32 paths.

## Next smallest vertical slice — Phase 1, slice 1

**Accounting core for a service-only entity (FA-A):** chart of accounts, fiscal periods,
accounting policy registry (gated on controller answers), `journal_headers/lines` with the
database-enforced balance trigger and immutability (ADR-006), `PostJournalCommand` with
idempotency keys, period lock, reversal. Acceptance: AT-001, AT-003, AT-004, AT-007 (rejection
of 100/99.99), AT-021. Depends on: open question 3 (base currency/basis per entity — demo
defaults acceptable for the synthetic fixture only).

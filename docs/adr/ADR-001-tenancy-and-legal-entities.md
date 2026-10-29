# ADR-001: Tenancy, legal entities and scoping

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-29
- **Supersedes:** —
- **FDD references:** §1.5, §4, §16.1, SaaS-002, SEC-004, CORE-IND-001, F-SEC-001

## Context

The platform must serve multiple isolated SaaS customers (tenants), each of which may own
several legal entities (companies) with separate books, base currencies, fiscal calendars and
tax regimes. Entities may have branches, departments, warehouses and projects, most of which are
optional per industry. Cross-tenant leakage is a release blocker (T-001, AT-030).

## Decision

1. **Hierarchy:** `tenant` → `company` (legal entity) → optional `branch`, `department`,
   `warehouse`, `project`. Every tenant-owned row carries `tenant_id NOT NULL`; every
   entity-owned row additionally carries `company_id NOT NULL`. Foreign keys between
   entity-owned rows are **composite** `(tenant_id, <id>)` so a row can never reference a
   sibling in another tenant even if an application bug passes the wrong id.
2. **Shared database, Row-Level Security:** one PostgreSQL database with `ENABLE ROW LEVEL
   SECURITY` + `FORCE ROW LEVEL SECURITY` on every tenant-owned table. Policies compare
   `tenant_id` with `current_setting('app.tenant_id', true)::uuid`. The application connects as
   a non-superuser role `aurora_app` that does **not** own the tables and therefore cannot
   bypass RLS. Each request runs inside a transaction that first executes
   `SET LOCAL app.tenant_id = $1` from the server-resolved session, never from client input.
3. **Tenant context is server-resolved.** The authenticated session determines `tenant_id`.
   The client may send `X-Company-Id` to select a company; the server verifies membership and
   permission for that company before honouring it. A request without a valid company context
   is rejected for company-scoped resources.
4. **Identifiers:** UUID v7 (time-ordered) generated in the application (`packages/types`),
   so IDs are unguessable but index-friendly. Document numbers (invoice, PO, journal) are a
   separate, gap-logged, per-entity series allocated transactionally (Phase 1).
5. **Shared vs entity-scoped master data:** a `party` is tenant-scoped (one identity), its
   commercial relationship (`party_entity_accounts`: credit limit, terms, price book, balances)
   is company-scoped. An `item` is tenant-scoped; costing, stock ownership and selling prices are
   company-scoped (Phase 1/2 tables).
6. **Platform administrators** are not members of tenants. Support access to tenant data is a
   Phase 5 feature requiring explicit, time-limited, audited impersonation (SaaS-003); there is
   no global read path in Phase 0.
7. **Future dedicated database per tenant** is possible without changing application code
   because all data access goes through the tenant-context transaction wrapper; a connection
   router can map `tenant_id` to a pool later.

## Consequences

- Positive: isolation is enforced by the database, not only by `WHERE` clauses; composite FKs
  turn whole classes of bugs into constraint violations; tests can prove isolation with a real
  database.
- Negative: every table needs the `tenant_id` column and policy; migrations must grant and
  police roles carefully; some joins carry an extra key. A migration lint (`scripts/check-rls.ts`)
  fails CI if a tenant-owned table lacks a policy.
- Integration tests run as `aurora_app`, never as the migration owner, so a missing policy
  surfaces as a failing test rather than silently returning all rows.

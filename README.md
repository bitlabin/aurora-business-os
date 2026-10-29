# Aurora Business OS

Multi-industry CRM + ERP + accounting platform: services, retail, distribution, manufacturing,
construction, rentals, subscriptions and hybrids on one tenant-isolated core. Industry-specific
behaviour is configuration (industry packs and module entitlements), never a fork.

**Status: Phase 0 (platform foundation) complete.** See `docs/progress.md` for what is real,
what is not, and the exact test evidence. The product contract is the FDD v2.0; engineering
rules for any contributor (human or agent) are in `CLAUDE.md`; decisions are in `docs/adr/`.

## Stack

pnpm + Turborepo monorepo · TypeScript (strict) · NestJS + Fastify API · Drizzle ORM on
PostgreSQL 16 (row-level security enforced) · Redis/BullMQ worker (scaffold) · Next.js 15 +
React 19 web app with an original design system (Arabic/English, RTL) · Vitest.

```
apps/api        NestJS modular monolith (modules: identity, tenancy, organization, audit,
                entitlements, parties, catalog, inventory)
apps/web        Next.js enterprise UI
apps/worker     Outbox relay / job consumers (Phase 1)
packages/types  Branded ids, exact-decimal Money/Quantity, permission & module catalogs, Zod contracts
packages/sdk    Typed API client
packages/ui     Design tokens and primitives
packages/config Shared tsconfig presets
infra/docker    Postgres + Redis for local development
docs/           ADRs, traceability matrix, open questions, progress
scripts/        RLS lint, local Postgres fallback
```

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm db:up            # Docker: Postgres 16 + Redis   (or: pnpm db:local — uses local pg binaries)
pnpm db:migrate       # applies apps/api/drizzle/*.sql as the admin role
pnpm db:seed          # DEMO dataset: 2 tenants, 4 businesses, 6 users (password Demo!Pass123)
pnpm dev              # API on :4000 (docs at /api/v1/docs), web on :3000
```

Demo sign-ins (all `Demo!Pass123`):

| Tenant slug       | User                      | Role                 | Companies                                                  |
| ----------------- | ------------------------- | -------------------- | ---------------------------------------------------------- |
| `northwind-group` | owner@northwind.demo      | owner                | NWC (service-only consultancy, USD), NWB (contractor, USD) |
| `northwind-group` | consultant@northwind.demo | sales_rep            | NWC only                                                   |
| `northwind-group` | auditor@northwind.demo    | auditor (read-only)  | NWC, NWB                                                   |
| `harbor-retail`   | owner@harbor.demo         | owner                | HRS (retailer, IQD), HDL (distributor, USD)                |
| `harbor-retail`   | stock@harbor.demo         | inventory_controller | HDL only                                                   |
| `harbor-retail`   | cashier@harbor.demo       | sales_rep            | HRS only                                                   |

## Quality gates

```bash
pnpm lint        # ESLint (type-checked) + dependency-cruiser module boundaries + RLS lint
pnpm typecheck
pnpm test        # unit tests (types, api domain, web components)
pnpm test:e2e    # API against a real Postgres as the application role (RLS enforced)
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push and pull request.

## Security model in one paragraph

Every tenant-owned table has `FORCE ROW LEVEL SECURITY` with a policy keyed on a
transaction-local setting that the API sets from the server-resolved session. The API connects
as `aurora_app`, a role that does not own the schema and cannot bypass RLS. Requests pass three
global guards in order: authentication → module entitlement (disabled module ⇒ `404
MODULE_DISABLED`) → permission + company scope (`403`, attempt audited). Audit and configuration
history tables are append-only at the database level. Details: ADR-001, ADR-003, ADR-004.

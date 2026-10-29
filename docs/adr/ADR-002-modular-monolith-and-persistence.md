# ADR-002: Modular monolith, persistence and migrations

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-29
- **FDD references:** §3.1, §3.2, §3.3, §16.1, §26.1, §26.3, CORE-IND-006, F-DATA-001/002

## Context

The FDD mandates a NestJS modular monolith with explicit module boundaries, a transactional
outbox, exact decimal money and quantities, versioned migrations and no business rules in the
frontend. The system must be maintainable for years by engineers who did not write it.

## Decision

### Repository layout

```
apps/api        NestJS HTTP application (composition root)
apps/worker     BullMQ consumers (outbox relay, jobs)      — scaffold in Phase 0, used Phase 1+
apps/web        Next.js UI
packages/types  Branded IDs, Money, Quantity, shared Zod schemas, error codes
packages/sdk    Typed API client generated from OpenAPI
packages/config Shared tsconfig / eslint / prettier
packages/ui     Design system (tokens, primitives, RTL)
infra/          docker-compose, migrations are owned by apps/api (see below)
docs/           ADRs, architecture, runbooks, progress
```

### Module structure (inside `apps/api/src/modules/<name>`)

| Layer | Allowed imports | Contains |
|---|---|---|
| `domain/` | `packages/types` only | Entities, value objects, invariants, domain errors. No NestJS, no Drizzle. |
| `application/` | `domain/`, other modules' **public** `index.ts` ports | Commands/queries, authorization checks, transaction orchestration, outbox publication. |
| `infrastructure/` | `domain/`, `application/`, Drizzle, Redis | Repositories, schema definitions, adapters. |
| `api/` | `application/` | Controllers, DTOs (Zod), OpenAPI decorators, guards. |
| `index.ts` | — | The module's **public contract**: exported NestJS module + service interfaces other modules may depend on. |

Boundaries are enforced by `dependency-cruiser` (`.dependency-cruiser.cjs`): a module may import
another module only through its `index.ts`; `domain/` may import nothing framework-related; a
violation fails `pnpm lint`.

### Persistence

- **Drizzle ORM** for typed queries and schema-as-code. Chosen over Prisma because it emits
  plain SQL (no proxy engine), supports `NUMERIC` as string without precision loss, and lets us
  express RLS, triggers and `CHECK` constraints in the same migration files.
- **Migrations are hand-reviewed SQL** under `apps/api/drizzle/`, generated with `drizzle-kit`
  then edited to add constraints Drizzle cannot express (RLS policies, triggers, composite FKs,
  balanced-journal checks). Migrations run through `drizzle-orm/migrator` in CI and at deploy;
  never `db push` in staging/production.
- Money and quantities are `NUMERIC(20,6)` in PostgreSQL and `Money`/`Quantity` value objects
  (string-backed, `decimal.js`) in TypeScript. API payloads encode them as **decimal strings**.
  ESLint forbids arithmetic on them as plain numbers via the branded types.
- Every table: `id uuid PK`, `tenant_id`, `created_at`, `updated_at`, `created_by`, `updated_by`,
  `version integer` for optimistic concurrency (`If-Match` on mutations).

### Transactions and outbox

- A request-scoped `UnitOfWork` opens a transaction, sets `app.tenant_id`, `app.user_id`,
  `app.request_id` as `SET LOCAL` settings, and commits/rolls back once.
- Domain events are written to `outbox_events` inside the same transaction as the state change.
  `apps/worker` relays them to BullMQ; consumers deduplicate on `(tenant_id, consumer, event_id)`
  in `processed_events`.

### Validation and contracts

- Zod schemas in `packages/types` are the single source of truth: they validate requests,
  generate OpenAPI (via `zod-openapi`), and generate the typed SDK. There is no separate DTO class
  hierarchy to drift.

## Consequences

- One deployable unit for the pilot; modules can be extracted later because they only talk
  through `index.ts` ports and events.
- Engineers must write SQL for constraints — intentional: financial invariants belong in the
  database.
- `pnpm lint` runs ESLint + dependency-cruiser + RLS check; CI fails on any boundary breach.

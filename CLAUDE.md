# Aurora Business OS — engineering rules for any coding agent

Read `docs/adr/README.md` and `docs/progress.md` first. The product contract is the FDD v2.0
(Section 0 and Appendix F override older distribution-specific examples; Appendix E is binding
for accounting and exports). Never hardcode an industry.

## Non-negotiables
- Tenant and company scoping on every row, query, job and cache key. Tests run as `aurora_app`
  (no RLS bypass). A new tenant-owned table needs: `tenant_id`, RLS policy, index, and a line in
  `apps/api/drizzle/rls-tables.json` or `pnpm lint` fails.
- Money and quantities: `Money` / `Quantity` from `@aurora/types` (decimal strings), `NUMERIC` in
  SQL. Never `number` arithmetic on amounts.
- Business rules live in `domain/`; controllers are thin; the frontend never enforces a rule the
  API does not.
- Posted financial/stock rows are immutable; corrections are reversals.
- Idempotency keys on every posting/stock/connector command.
- Disabled module → `404 MODULE_DISABLED`; denied permission → `403`. Never leak existence.
- No fake buttons, demo data not labelled `DEMO`, or skipped core tests.

## Module layout (`apps/api/src/modules/<name>/`)
`domain/` (pure) → `application/` (commands, queries, authz, transactions) → `infrastructure/`
(Drizzle repos, schema) → `api/` (controllers, Zod DTOs). Other modules import only `index.ts`.
`dependency-cruiser` enforces this.

## Workflow for a slice
1. List FDD section + assumptions in the PR description.
2. Schema + SQL migration (with constraints) → domain + unit tests → application → API +
   integration tests (real Postgres) → UI → docs (`docs/progress.md`, traceability matrix, ADR).
3. Run `pnpm lint && pnpm typecheck && pnpm test` and paste real output in the delivery report
   (format in FDD §26.4).

## Commands
`pnpm install` · `pnpm db:up` (docker) or `pnpm db:local` (pg_ctl) · `pnpm db:migrate` ·
`pnpm db:seed` · `pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e`

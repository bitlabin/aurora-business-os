# Phase 0 demo walkthrough

A hands-on script for evaluating what Phase 0 delivers. Every step names the expected result so
a reviewer can tell a bug from a deliberate limit. Phase 0 is the platform foundation: tenants,
companies, people and roles, module entitlements, industry packs, parties, the universal item
model, warehouses as master data, and the audit trail. There are no invoices, journals, stock
movements or reports yet; those are Phase 1 onwards (see `docs/progress.md`).

## Start the stack

```bash
git clone https://github.com/bitlabin/aurora-business-os.git
cd aurora-business-os
docker compose -f infra/docker/docker-compose.demo.yml up --build
```

Wait for `migrate-1 | aurora: database ready` and `web-1 | ✓ Ready`. Open http://localhost:3000.

## Demo sign-ins

All passwords are `Demo!Pass123`. Each user belongs to exactly one tenant, so the sign-in form
needs only email and password.

| User                      | Tenant        | Role                 | Sees                                             |
| ------------------------- | ------------- | -------------------- | ------------------------------------------------ |
| owner@northwind.demo      | Northwind     | owner                | NWC (consultancy, USD) and NWB (contractor, USD) |
| consultant@northwind.demo | Northwind     | sales_rep            | NWC only; no Settings section                    |
| auditor@northwind.demo    | Northwind     | auditor              | NWC and NWB, read-only; audit tabs on records    |
| owner@harbor.demo         | Harbor Retail | owner                | HRS (retailer, IQD) and HDL (distributor, USD)   |
| stock@harbor.demo         | Harbor Retail | inventory_controller | HDL only; warehouses and items                   |
| cashier@harbor.demo       | Harbor Retail | sales_rep            | HRS only; no warehouse menu (module not enabled) |

## 1. A service-only business needs no inventory (MI-001, MI-004)

1. Sign in as **owner@northwind.demo**. The company switcher at the top shows
   `NWC · Northwind Consulting (USD)`.
2. The sidebar always follows the same product map — Home, Products, Customers, Suppliers,
   Invoices, Orders, Payments, Expenses, Accounting, Settings. Sections that are not built yet
   (Invoices, Orders, Payments, Expenses, Accounting) are greyed out with a **Phase 1** tag and
   are not clickable; they light up in place as each module ships. Expand **Products**: there is
   **no Warehouses entry** because the inventory module is not enabled for this tenant — what is
   live is decided by entitlements and permissions, never by a fixed menu. `Ctrl+K` focuses the
   menu search.
3. Open **Products → Items & services**. Every row is a service, labour rate or expense item with no
   physical attributes.
4. **+ Create → Item**. Choose kind `SERVICE`. The physical section (barcode, dimensions,
   tracking) is not shown; the form explains that this kind has no physical attributes. Create
   `Discovery workshop` with any code. It appears in the list immediately.
5. Type `http://localhost:3000/inventory/warehouses` in the address bar. Expected: an error state
   saying the module is not enabled. The API answered `404 MODULE_DISABLED`; it does not reveal
   whether warehouses exist (FDD §21).
6. Switch the company selector to `NWB · Northwind Builders`. Items now show the contractor's
   catalogue (for example `Ready-mix concrete (per m³)`, a `NONSTOCK_GOOD`: a physical thing
   that is bought and billed but never stocked). Switching company
   never requires signing in again; scope is enforced per request.

## 2. Roles and company scope (SEC-001, SEC-003, T-020)

1. Sign out (top right). Sign in as **consultant@northwind.demo**.
2. The Settings section is absent and the company switcher offers only NWC: this user is
   scoped to one company.
3. Open **Customers** (or **Suppliers**), open any record. There is no **Archive** button: the sales_rep role has no
   `crm.party.archive` permission. The UI hides it, and the API answers
   `403 FORBIDDEN "Missing permission crm.party.archive"` to a direct call regardless.
4. Sign in as **auditor@northwind.demo**. Everything is readable, nothing is editable, and record
   pages carry an **Audit** tab with the history of that record.

## 3. Modules and industry packs are configuration, not forks (CFG-001, CFG-003)

1. Sign in as **owner@northwind.demo**, open **Settings → Modules & industry packs**.
2. Enter a reason (required, at least 3 characters: the reason is written to the audit trail).
   Enable **inventory**. **Products → Warehouses** appears in the sidebar at once; the entitlement is
   evaluated per request, not cached in the browser.
3. Disable **inventory** again. Expected: allowed. The API runs every registered deactivation
   guard before disabling a module and refuses with the list of blockers; the first guard
   (open stock balances) arrives with the stock ledger in Phase 2, so in Phase 0 nothing blocks.
4. In the packs table, click **Preview** on `construction`. The diff shows which modules the pack
   would enable and which capabilities it would set, and nothing is changed until **Install**.
   Install it. Preview again: `No changes` (installs are idempotent, and each install is
   recorded as an immutable configuration event).
5. The `nonprofit` pack carries a **Not installable** badge: its rules are documented but not
   implemented, so the platform refuses rather than pretending (FDD §12.3).

## 4. Physical goods, lots, serials, two currencies in one tenant (MI-009, MI-019, MI-021)

1. Sign in as **owner@harbor.demo**. Company `HDL · Harbor Distribution (USD)`.
2. **Items & Services → Vitamin C 500mg, 60 tablets**: tracking shows lot and expiry; the EAN-13
   barcode is listed. **Handheld barcode scanner X1**: serial-tracked. A delivery fee item has no
   tracking at all. Tracking is a per-item choice.
3. **+ Create → Item**, kind `STOCKED_GOOD`. Tick `Track expiry dates` without
   `Track lots / batches` and submit. Expected: refused with `expiry tracking requires lot
tracking` next to the field. The rule lives in the shared domain package, is enforced by the
   API (`422 BUSINESS_RULE`) and is also a database CHECK constraint, so no client can bypass it.
4. **Warehouses** lists `MAIN` and `RETURNS & quarantine`. Create a third one; it appears with an
   audit entry.
5. Switch to `HRS · Harbor Retail Stores (IQD)`. The company switcher shows the base currency
   (IQD, three decimals when amounts arrive in Phase 1); the T-shirt barcode `0012345` keeps its
   leading zeros. Two legal entities, two base currencies, one party master; there are no
   prices or amounts on items yet.
6. Sign in as **cashier@harbor.demo**: HRS only, no Warehouses entry, no Settings.

## 5. Cross-tenant isolation (T-001, T-002, T-022)

1. Sign in as **owner@harbor.demo**, open any party and copy its id from the address bar.
2. Sign in as **owner@northwind.demo** and open `http://localhost:3000/crm/parties/<that id>`.
   Expected: **not found**. Row-level security in PostgreSQL filters the row for the other
   tenant before the application sees it; the API role cannot bypass that policy.
3. The same holds for every table, query, list and search: the automated suite
   (`pnpm test:e2e`, file `isolation.e2e-spec.ts`) runs these checks as the application role on
   every push.

## 6. Everything leaves a trace (SEC-005)

1. As **owner@northwind.demo**, open **Settings → Audit log**.
2. Find your own `auth.login`, the `entitlement.*` rows from step 3 with the reason you typed,
   the `industry_pack.installed` row, and `item.created` for the workshop.
3. Rows marked **sensitive** had their payload redacted before storage; passwords and tokens
   never reach the log. The table is append-only at the database (no UPDATE/DELETE grant and a
   trigger that rejects edits even by the admin role).

## 7. Arabic and right-to-left (NFR-I18N)

1. Switch the language selector (top bar) to **العربية**. The whole shell flips to RTL: sidebar
   on the right, tables and forms mirrored, bilingual names (`name.ar`) shown where the record
   has them. Numbers and codes stay Latin.
2. Reload: the choice persists (cookie `aurora_locale`); the `<html>` element is rendered with
   `lang="ar" dir="rtl"` on the server, so there is no flash of the wrong direction.

## 8. API reference and raw calls

- Swagger UI: http://localhost:4000/api/v1/docs (32 routes). Every route declares exactly one of
  `@Public`, `@AuthOnly` or `@RequirePermission`; a test fails the build otherwise.
- Sign in from any HTTP client to get a token and call the API directly:

  ```bash
  curl -s -X POST http://localhost:4000/api/v1/auth/login \
    -H 'content-type: application/json' \
    -d '{"email":"owner@northwind.demo","password":"Demo!Pass123"}'
  ```

- Disabled module from the API: `GET /api/v1/warehouses` with the Northwind token
  (`Authorization: Bearer <token>`) and `X-Company-Id: <NWC id from GET /api/v1/companies>`
  answers `404 {"code":"MODULE_DISABLED"}`; the denied attempt is audited.

## Resetting

`docker compose -f infra/docker/docker-compose.demo.yml down -v` drops the database volume. The
next `up` migrates and reseeds from scratch. Without `-v`, data and the seed state persist and
the seed step reports `DEMO data already present; nothing to do`.

## Known Phase 0 limits you will hit

- Records can be created, viewed and archived, not edited in place (edit forms are Phase 1).
- No search box, saved views or command palette yet.
- Warehouses are master data only; there is no stock ledger, so quantities are not shown.
- MFA and passkeys are reserved in the schema but not implemented.
- The worker service exists as a scaffold; the outbox is written but no consumer runs.

The full list, with the test evidence behind each delivered item, is in `docs/progress.md`.

# Open Business Questions — Owner Review Required

Source: FDD v2.0, Appendix D. These questions are **not guessed** in production code.
Development/demo environments use clearly synthetic assumptions, labelled `DEMO` in seed
data, until the owner answers here. Each answer is recorded with a date and the ADR or
configuration it unlocks.

| # | Question | Status | Demo assumption (synthetic, not business truth) | Unlocks |
|---|---|---|---|---|
| 1 | Exact tenant / legal-entity structure. Are the pilot companies under one controlled group? | **OPEN** | Two demo tenants: `Northwind Group` (service-only entity + contractor entity) and `Harbor Retail Holdings` (retailer entity + distributor entity). No real company data. | ADR-001, seed data, consolidation scope |
| 2 | Which e-commerce stores (if any) are integrated, and which legal entity owns each order/inventory location? | **OPEN** | None. Connector framework is provider-neutral; no adapter enabled. | ADR-007, Phase 2 |
| 3 | Base currency, accounting basis, tax jurisdiction and invoice compliance needs per legal entity. | **OPEN** | Demo entities use USD / accrual / no tax regime configured. No tax rates are seeded. | ADR-005, ADR-006, ADR-008, Phase 1 |
| 4 | Inventory valuation method the controller will approve (FIFO vs moving weighted average), and how historical stock is currently valued. | **OPEN** | Not applicable in Phase 0 (no stock ledger). | ADR-004, Phase 2 |
| 5 | Who owns accurate opening balances and batch-level counted inventory for cutover? | **OPEN** | Not applicable until a live entity is configured. | Phase 1/3 cutover |
| 6 | Specific role, credit-limit, price-override thresholds and return-eligibility policies. | **OPEN** | Seed roles follow FDD §20 baseline matrix with no monetary thresholds. | Approval policies, Phase 1 |
| 7 | Does any statutory e-invoicing, data residency, tax filing or regulatory licensing apply? | **OPEN** | None assumed; regulated modules are disabled. | Compliance workstreams |
| 8 | First-launch languages/locations and which integrations can be licensed/tested. | **OPEN** | English + Arabic UI; no external integrations. | i18n scope, connector pilots |

## Engineering decisions taken by default (reversible, recorded as ADRs)

These were decided to unblock Phase 0 and can be reversed by the owner before Phase 1:

- **ORM / migrations:** Drizzle ORM with hand-written SQL migrations for every financial or
  security-relevant constraint (ADR-002).
- **Identity:** first-party authentication (Argon2id password hashing, opaque server-side
  sessions, MFA-ready) behind an `IdentityProvider` port so an OIDC provider can be substituted
  without touching business modules (ADR-003).
- **Feature-disabled HTTP status:** disabled modules return `404 Not Found` with a stable
  error code `MODULE_DISABLED` so disabled modules and nonexistent resources are
  indistinguishable to an attacker; denied permission returns `403` (ADR-005, FDD F-API-001).
- **IDs:** UUID v7 (time-ordered) generated application-side (ADR-001).

## How to answer

Edit this file in a pull request, change the status to `ANSWERED (YYYY-MM-DD)` and name the
approver. Engineering will update the linked ADR and configuration in the same PR.

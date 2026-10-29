# Requirements Traceability Matrix

Maps every requirement ID in the FDD v2.0 (including Appendix E and Appendix F) to the phase
that delivers it, the owning module, and the test or evidence that proves it.

Status legend: `DONE` (implemented, tested, in `main`), `PARTIAL` (foundation only — see note),
`PLANNED` (phase assigned, no code), `GATED` (requires owner/controller sign-off before build).
A requirement is only `DONE` when its authorization, validation, persistence, audit and automated
tests pass — a screen or table alone does not count (FDD implementation rule).

This file is updated in the same commit as the code it describes. `docs/progress.md` carries the
narrative; this file is the index.

## 1. Cross-industry core (Appendix F.1)

| ID | Requirement (short) | Phase | Module(s) | Status | Evidence |
|---|---|---|---|---|---|
| CORE-IND-001 | Common core runs without warehouse/POS/WO/project | 0–1 | tenancy, organization, parties, catalog, general-ledger | PARTIAL | Phase 0: service-only entity seeded; `MI-001` subset (item creation without warehouse) tested. Invoicing/GL in Phase 1. |
| CORE-IND-002 | Capability modules gated by audited `module_entitlements`; UI and API enforce same entitlement | 0 | entitlements | DONE | `entitlements.e2e-spec` — inventory endpoint returns `404 MODULE_DISABLED` for a tenant without `inventory`; audit event on activation |
| CORE-IND-003 | Industry templates are versioned presets, preview + approve, never mutate posted data | 0 | entitlements (industry-packs) | PARTIAL | Pack manifests versioned; `preview` diff and `install` with audit implemented for entitlements, roles, navigation, item categories. Custom fields/workflows/COA examples arrive with their modules (Phase 1+). |
| CORE-IND-004 | One `party` identity (person/organization) with multiple roles; entity-scoped commercial profile separate | 0 | parties | DONE | `parties.e2e-spec` — one party holds customer + supplier roles; `party_entity_accounts` keyed `(tenant, entity, party)` |
| CORE-IND-005 | Service-only, retail, manufacturing, construction entities share GL/report engine | 1–4 | general-ledger, reports | PLANNED | Phase 1 proves service-only; Phase 3/4 prove POS/projects/WIP on same ledger |
| CORE-IND-006 | Metadata-driven customization; no EAV for ledgers; sandboxed rules | 0–1 | platform | PARTIAL | Phase 0: typed tables only, `custom_fields` JSONB column reserved and validated by Zod per module. Rules engine Phase 1/2 (sandboxed expression evaluator ADR pending). |
| CORE-IND-007 | Module activation/deactivation readiness checks, owner approval, audit; no purge of history | 0 | entitlements | PARTIAL | Activation + audit + deactivation implemented; "open commitments" blockers wired as a `DeactivationGuard` registry that later modules register with (inventory/AP guards arrive in Phase 2). |

## 2. Item and revenue model (Appendix F.2)

| ID | Requirement | Phase | Module | Status | Evidence |
|---|---|---|---|---|---|
| F-ITEM-001 | Eight discriminated item kinds with common attributes | 0 | catalog | DONE | `items` table `kind` enum; `catalog.e2e-spec` creates each kind |
| F-ITEM-002 | Capability flags with compatibility rules; services never require physical fields | 0 | catalog | DONE | `ItemKindPolicy` unit tests: `SERVICE` rejects `track_inventory`; `STOCKED_GOOD` without `track_expiry` accepted; API accepts service item with no warehouse/barcode/expiry |
| F-ITEM-003 | UOM / time-unit / packaging conversions, history-safe | 0 (base), 2 (conversions) | catalog | PARTIAL | `item_uoms` base + display unit in Phase 0; versioned conversion table Phase 2 |
| F-ITEM-004 | Pricing precedence (fixed, tiers, contract, recurring, T&M, rental tariffs) | 1 | sales-pricing | PLANNED | |
| F-ITEM-005 | Transaction line discriminators and snapshots | 1 | invoicing | PLANNED | |
| F-ITEM-006 | Posted classification immutable against master changes | 1 | invoicing, general-ledger | PLANNED | |

## 3. Industry packs (Appendix F.3)

| ID range | Pack | Phase | Status | Gate |
|---|---|---|---|---|
| F-PACK-01 | General business foundation | 0–1 | PARTIAL | Phase 0 seeds the pack; Phase 1 invoice → close → XLSX/PDF/DOCX |
| F-PACK-02 | Wholesale/distribution (optional) | 2 | PLANNED | Valuation method (open question 4) |
| RET-001..RET-005 | Retail POS | 3 | PLANNED | Tender/processor policy sign-off |
| PROJ-001..PROJ-004 | Professional services | 3 | PLANNED | Labor cost policy sign-off |
| CON-001..CON-004 | Construction | 4 | GATED | WIP/revenue recognition policy (controller) |
| MFG-001..MFG-004 | Manufacturing | 4 | GATED | Costing/overhead policy |
| FS-001..FS-003 | Field service | 4 | PLANNED | |
| RNT-001..RNT-003 | Rentals | 4 | GATED | Asset vs merchandise policy |
| SUB-001..SUB-003 | Subscriptions | 4 | GATED | Deferred revenue policy |
| F-PACK-10 | Nonprofit/education/hospitality/healthcare-adjacent | — | GATED | Not engineered; `MI-024` asserts regulated fields are absent |

Industry pack manifests exist in Phase 0 only as **entitlement + navigation + role presets**;
every operational workflow above is built in its named phase.

## 4. Workflows, accounting, data, UX, API, BI, security (Appendix F.4–F.10)

| ID | Phase | Status | Note |
|---|---|---|---|
| F-WF-001..F-WF-008 | 1–4 | PLANNED | Unified commercial flow in Phase 1; branches with their packs |
| F-FIN-001 | 1 | PLANNED | Appendix E contract is Phase 1 (service-only) and Phase 3 (full close) |
| F-FIN-002..F-FIN-006 | 1–3 | PLANNED | Statement templates per industry profile |
| F-DATA-001 | 0 | DONE | Typed tables; `custom_fields` JSONB validated; indexes on `(tenant_id, …)` |
| F-DATA-002 | 0 | DONE | `outbox_events` envelope with `event_id, tenant_id, entity_id, aggregate, version, actor, idempotency_key, schema_version, cause` |
| F-DATA-003 | 1 | PLANNED | Posting-time dimension snapshots |
| F-UX-001 | 0 | DONE | Sidebar generated from entitlements + permissions; optional sections hidden when module disabled |
| F-UX-002 | 1+ | PLANNED | Industry landing pages need transactional data |
| F-UX-003 | 0 | PARTIAL | Create control lists only implemented actions (Party, Item); no placeholders |
| F-UX-004 | 0 | DONE | Shared design tokens, RTL, keyboard navigation in list/detail templates |
| F-API-001 | 0 | DONE | `/api/v1/capabilities`, `/industry-packs`, `/industry-packs/{id}/preview`, `/install`, `/items`, `/parties`; disabled module → `404 MODULE_DISABLED`, denied → `403` |
| F-API-002 | 2 | PLANNED | Connector contract (ADR-007 drafted) |
| F-API-003 | 5 | PLANNED | |
| F-BI-001..F-BI-003 | 1–4 | PLANNED | |
| F-SEC-001 | 0 | DONE | RLS, entity authority, RBAC/ABAC scopes, audit |
| F-SEC-002 | 1+ | PLANNED | SoD thresholds arrive with approval policies |
| F-SEC-003 | 0 | DONE (by absence) | No regulated data models exist |
| F-SEC-004 | 5 | PLANNED | |
| F-ROAD-001 | 0 | DONE | Seed: service-only, retailer, distributor (lot-tracked items), contractor across two tenants |
| F-ROAD-002 | 0 | DONE | One `parties`/`items` schema; packs add tables only in their phase |

## 5. Multi-industry acceptance tests (Appendix F.12)

| ID | Phase | Status | Test |
|---|---|---|---|
| MI-001 | 0 (item) / 1 (invoice) | PARTIAL | `catalog.e2e-spec`: service item created with no warehouse/barcode/expiry in service-only entity. Invoice in Phase 1. |
| MI-002, MI-003 | 1 | PLANNED | |
| MI-004 | 0 | DONE | `entitlements.e2e-spec`: inventory command on inventory-disabled tenant → `404 MODULE_DISABLED`, body carries no foreign data |
| MI-005, MI-006 | 3 | PLANNED | |
| MI-007, MI-008 | 3 | PLANNED | |
| MI-009, MI-010 | 2 | PLANNED | |
| MI-011 | 0 | DONE | `industry-packs.e2e-spec`: preview returns diff; install creates `config_install_events` row; no other table touched (asserted by row-count snapshot) |
| MI-012 | 0 (framework) / 2 (guards) | PARTIAL | Deactivation guard registry tested with a fake guard |
| MI-013..MI-016 | 1–4 | PLANNED | |
| MI-017 | 0 (UI) / 1 (exports) | PARTIAL | Locale switch does not alter API payloads (web unit test) |
| MI-018 | 0 | DONE | `isolation.e2e-spec`: Company A role cannot list Company B parties/items |
| MI-019 | 0 | DONE | Two tenants with different packs share `parties`/`items` schema (structural; verified by seed + tests) |
| MI-020 | 2 | PLANNED | |
| MI-021 | 0 (structure) / 3 (books) | PARTIAL | `companies` carry distinct base currency + fiscal-year start; charts/tax Phase 1/3 |
| MI-022, MI-023 | 1/4 | PLANNED | |
| MI-024 | 0 | DONE (by absence) | Grep-based test asserts no `patient`/`diagnosis`/`clinical` columns exist |
| MI-025 | 1 | PLANNED | |

## 6. Original FDD requirements

| ID range | Section | Phase | Status |
|---|---|---|---|
| ORG-001..ORG-004 | Tenant / entity / branch / master config | 0 | ORG-001, ORG-002 DONE; ORG-003 PARTIAL (branches, departments); ORG-004 PARTIAL (industry profile selection, custom-field schema registry) |
| CRM-001..CRM-009 | CRM | 1 | PLANNED (CRM-002 shared party record is DONE in Phase 0 as `parties`) |
| SAL-001..SAL-010 | Sales | 1–2 | PLANNED (SAL-001 catalog foundation DONE) |
| PUR-001..PUR-009 | Procurement | 2 | PLANNED |
| INV-001..INV-013 | Inventory/WMS | 2 | PLANNED (INV-001 item master DONE) |
| ACC-001..ACC-014 | Accounting core | 1 (ACC-001..005, 008 service subset), 3 (rest) | PLANNED |
| TAX-001/002, EXP-001/002, FIN-001..003 | Tax, expenses, finance | 1–3 | PLANNED |
| BI-001..BI-006 | Analytics | 1–4 | PLANNED |
| AUTO-001..003, DOC-001/002 | Automation, documents | 1–2 | PLANNED |
| SEC-001..SEC-007 | Security | 0 (001 subset, 002, 003, 004, 005), 1+ (006, 007 hardening) | SEC-002/003/004/005 DONE; SEC-001 PARTIAL (sessions, lockout, rotation; MFA/passkeys Phase 1) |
| INT-001..INT-005 | Integrations | 2 | PLANNED |
| SaaS-001..003 | SaaS | 5 | PLANNED |
| NFR-001..NFR-013 | Non-functional | continuous | NFR-005/006/008/012 PARTIAL in Phase 0 |
| T-001, T-002, T-019, T-020 | Critical tests | 0 | DONE (`isolation.e2e-spec`, `rbac.e2e-spec`) |
| T-003..T-030 (others) | Critical tests | 1–3 | PLANNED |

## 7. Appendix E — accounting and reporting contract

| ID range | Phase | Status | Milestone |
|---|---|---|---|
| FA-001..FA-010 (ledger invariants) | 1 | PLANNED | FA-A / FA-B |
| FA-011..FA-023 (COA, setup, close, assets, budgets, …) | 1 (FA-011, FA-012 subset), 3 (rest) | PLANNED | FA-C |
| FR-001..FR-009 (engine contract) | 1 | PLANNED | FA-D |
| FR-010..FR-019 (statements) | 1 (P&L, BS, CF, TB, equity) | PLANNED | FA-D |
| FR-020..FR-055 (catalog) | 1 (FR-020..027), 2–3 (rest) | PLANNED | FA-D |
| EX-001..EX-018 (XLSX/PDF/DOCX) | 1 | PLANNED | FA-E |
| AT-001..AT-045 | 1 (AT-001..004, 010..012, 016..018, 021, 023..031, 035..037, 041..043), 2–3 (rest) | PLANNED | FA-F |

Phase 0 contributes to Appendix E only through the primitives every accounting slice will use:
`Money` / `Quantity` exact-decimal types, UUID v7 IDs, tenant + entity scoping, outbox envelope,
audit events, and the RLS/authorization layer (`AT-029`, `AT-030`, `AT-031` foundations).

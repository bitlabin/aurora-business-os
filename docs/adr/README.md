# Architecture Decision Records

| ADR                                                          | Title                                        | Status             |
| ------------------------------------------------------------ | -------------------------------------------- | ------------------ |
| [ADR-001](ADR-001-tenancy-and-legal-entities.md)             | Tenancy, legal entities and scoping          | Accepted           |
| [ADR-002](ADR-002-modular-monolith-and-persistence.md)       | Modular monolith, persistence and migrations | Accepted           |
| [ADR-003](ADR-003-identity-and-sessions.md)                  | Identity, sessions and authorization model   | Accepted           |
| [ADR-004](ADR-004-module-entitlements-and-industry-packs.md) | Module entitlements and industry packs       | Accepted           |
| [ADR-005](ADR-005-universal-item-kinds.md)                   | Universal item model and item-kind policies  | Accepted           |
| [ADR-006](ADR-006-immutable-accounting-ledger.md)            | Immutable double-entry ledger                | Proposed (Phase 1) |
| [ADR-007](ADR-007-report-snapshots-and-exports.md)           | Report snapshots and multi-format export     | Proposed (Phase 1) |
| [ADR-008](ADR-008-connector-abstraction.md)                  | Provider-neutral connector abstraction       | Proposed (Phase 2) |

Conventions: one decision per file, numbered, never edited after acceptance — a change is a new
ADR that supersedes the old one. Each ADR lists the FDD requirement IDs it serves so the
traceability matrix can point back.

ADRs still to be written before their phase: accounting policies (ADR-009, gated on controller),
tax jurisdictions (ADR-010), multi-currency (ADR-011), optional inventory costing (ADR-012),
backup/retention (ADR-013), documents/object storage (ADR-014), offline operations (ADR-015),
SaaS billing (ADR-016), project/POS/production ledger boundaries (ADR-017).

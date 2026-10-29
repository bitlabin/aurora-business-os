# ADR-004: Module entitlements and industry packs

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-29
- **FDD references:** CORE-IND-002, CORE-IND-003, CORE-IND-007, F-API-001, F-UX-001, MI-004,
  MI-011, MI-012, §2.2, §25.3 ADR-014

## Context

Inventory, POS, projects, manufacturing, field service, rentals and subscriptions are optional.
Industry templates must configure, not fork, the product. Disabled modules must be unreachable
through the API, invisible in navigation, and auditable when toggled.

## Decision

### Capability modules

- The catalogue of modules is a typed constant in `packages/types/src/modules.ts`:
  `crm`, `sales`, `accounting`, `purchasing`, `inventory`, `warehouse`, `pos`, `projects`,
  `manufacturing`, `field_service`, `rentals`, `subscriptions`, `service_desk`, `documents`,
  `automation`, `analytics`. Core modules (`crm`, `sales`, `accounting`, `documents`,
  `analytics`) are **always on** and cannot be disabled; the rest are optional.
- `module_entitlements (tenant_id, module, status, enabled_at, enabled_by, disabled_at,
  reason, version)` holds the tenant-level switch. `entity_capabilities (tenant_id, company_id,
  module, enabled)` narrows optional modules per legal entity (a tenant may enable inventory for
  its distributor entity but not its consulting entity).
- Every change writes an `audit_events` row and an outbox event `entitlement.changed`.

### Enforcement

- Controllers (and whole controller classes) declare `@RequireModule('inventory')`. The
  `ModuleGuard` runs **before** permission checks and, if the module is not enabled for the
  tenant and selected company, responds `404` with `{ code: 'MODULE_DISABLED' }`. `404` was
  chosen over `403` so a disabled module and a nonexistent route are indistinguishable (no
  capability fingerprinting); the code is stable so the UI can explain it.
- `GET /api/v1/capabilities` returns the effective module set for the current user/company and
  the navigation tree derived from it; the web sidebar is built from that response only.
- Background jobs and outbox consumers call `EntitlementService.assertEnabled()` with the same
  semantics.

### Deactivation

- `EntitlementService.disable()` consults a `DeactivationGuard` registry. Modules register
  guards that return blocking reasons (open stock commitments, unposted journals, pending
  payments). Phase 0 ships the registry and a test guard; inventory/AP guards arrive with their
  modules. Deactivation never deletes rows.

### Industry packs

- A pack is a **versioned manifest** (`apps/api/src/modules/entitlements/packs/*.ts`), e.g.
  `professional-services@1.0.0`, with: modules to enable, roles to seed, navigation defaults,
  item categories, example COA (Phase 1), document templates (Phase 1), custom field definitions
  (Phase 1), dashboards (Phase 1+).
- `POST /industry-packs/{id}/preview` computes a **diff** against the tenant's current state
  (what would be enabled/added/changed, what conflicts) without writing anything.
- `POST /industry-packs/{id}/install` applies the diff inside one transaction, records
  `tenant_industry_packs (tenant_id, pack_id, version, installed_at, installed_by)` and an
  immutable `config_install_events` row carrying the applied diff. Installation only touches
  configuration tables; a test asserts posted/operational tables are untouched (MI-011).
- Removing a pack disables its optional modules (subject to deactivation guards) and marks the
  pack record `removed`; it never deletes business records.

## Consequences

- One codebase, no per-industry branches; a tenant can combine packs.
- Entitlement is checked in exactly one guard and one service — a single place to audit.
- UI never hard-codes module visibility; it renders the capabilities response.

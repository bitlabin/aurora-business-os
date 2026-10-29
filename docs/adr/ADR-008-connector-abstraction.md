# ADR-008: Provider-neutral connector abstraction

- **Status:** Proposed (contract fixed Phase 0; first adapter Phase 2)
- **Date:** 2026-10-29
- **FDD references:** INT-001..INT-005, INV-013, F-API-002, MI-020, T-005, T-026, T-030

## Context

Shopify was a mandatory integration in older prompts. Under v2.0 it is one optional adapter
among POS, marketplaces, payment providers, banks and shipping carriers. Core tables must never
be shaped by a specific provider, and every adapter must be idempotent and reconcilable.

## Decision

1. **Contract** (`packages/types/src/connectors.ts`), implemented by every adapter:
   `connect()`, `mapExternalIds()`, `verifyEvent()`, `ingest()`, `publish()`, `reconcile()`,
   `health()`, `disconnect()`.
2. **Core tables are provider-neutral:** `integration_connections` (provider, company,
   credentials reference, scopes, status), `external_id_mappings`
   (`tenant_id, connection_id, external_type, external_id` UNIQUE → internal id),
   `inbound_webhook_events` (raw payload, provider event id, signature status, received_at,
   processed_at, outcome), `sync_jobs`, `processed_events`.
3. **Exactly-once effect:** inbound events are deduplicated on `(connection_id, provider_event_id)`
   before any domain command runs; domain commands themselves are idempotent via posting keys,
   so a replay that slips through still has one effect.
4. **Ownership map** per connection and object type (`items`, `prices`, `orders`, `customers`,
   `inventory`): `aurora_owner`, `external_owner`, `bidirectional_with_policy`. Two-way sync is
   refused until an ownership row exists (INT-005, FDD §25.2).
5. **Reconciliation** is a scheduled `reconcile()` per connection that lists provider-side
   objects since a cursor and backfills missed events without duplicating.
6. **Adapters live in `apps/api/src/modules/integrations/adapters/<provider>/`** and register
   themselves; enabling an adapter for a company is an entitlement + connection record, not a
   deploy.

## Consequences

- Phase 0 ships only the contract and the neutral tables (empty); no adapter code.
- Shopify (when a pilot enables it) implements the contract; nothing in `catalog`, `sales` or
  `inventory` references Shopify.

# ADR-005: Universal item model and item-kind policies

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-29
- **FDD references:** INV-001, SAL-001, F-ITEM-001..006, MI-001, MI-009, MI-022, §25.3 ADR-015

## Context

One catalog must serve stocked products, nonstock goods, services, digital goods, bundles,
subscription plans, rental assets and manufactured goods. Physical attributes (warehouse, lot,
serial, expiry, barcode, weight) must never be mandatory for a service, and lot/expiry/serial
must be per-item capabilities, not global requirements.

## Decision

1. **Single `items` table, discriminated by `kind`** (`STOCKED_GOOD`, `NONSTOCK_GOOD`,
   `SERVICE`, `DIGITAL_GOOD`, `BUNDLE`, `SUBSCRIPTION_PLAN`, `RENTAL_ASSET`,
   `MANUFACTURED_GOOD`). Common columns: `tenant_id`, `code` (unique per tenant, case-preserved,
   compared case-insensitively), localized `name` (JSONB `{en, ar, …}` validated by Zod),
   `description`, `category_id`, `base_uom_id`, `status`, `custom_fields`.
2. **Capability flags** live on the item: `track_inventory`, `track_lot`, `track_serial`,
   `track_expiry`, `track_location`, `is_sellable`, `is_purchasable`, `is_billable`,
   `is_taxable`, `requires_fulfillment`. Defaults and allowed combinations come from a
   per-kind policy in `domain/item-kind-policy.ts`, enforced in the domain layer and mirrored
   as a database `CHECK` so, for example, `kind = 'SERVICE' AND track_inventory = true` cannot be
   inserted by any path.
3. **Physical attributes live in a separate `item_physical_profiles` table** (`barcodes`,
   `dimensions`, `weight`, `pack conversions`, `reorder policy`), 0..1 per item, only allowed
   for kinds whose policy permits physical stock. A service item simply has no row — nothing
   is "null-filled", nothing is required.
4. **Accounting mapping is per entity** (`item_account_mappings`, Phase 1): revenue, COGS/expense
   and asset accounts are company-scoped because each legal entity has its own chart.
5. **Fulfillment / recognition strategy** is a function of `kind` resolved at document-line
   creation time (Phase 1) and **snapshotted** on the line (`item_kind_snapshot`,
   `fulfillment_mode`). Changing an item's kind after it has been used on a posted document is
   rejected; a new item must be created.
6. **Variants** (`item_variants`) and **UOM conversions** (`item_uom_conversions`, versioned,
   effective-dated) are additive tables that only stocked/manufactured kinds use; Phase 0
   ships base UOM only.
7. **Bundles** reference components in `bundle_components` with an explicit
   `bundle_strategy` (`KIT_ON_SALE`, `ASSEMBLED`, `PRICE_ONLY`) so stock behaviour is never
   implicit (Phase 2).

## Consequences

- MI-001/MI-022: a service item is created with `kind`, `code`, `name`, `base_uom_id` and
  nothing else; the API schema for `SERVICE` does not even accept physical fields.
- Industry packs only add **categories and defaults**; the schema is shared.
- The `CHECK` constraint means an ORM bug or raw SQL cannot create an impossible item.

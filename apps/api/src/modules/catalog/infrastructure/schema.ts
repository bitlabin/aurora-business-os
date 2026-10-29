import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { auditColumns, idColumn, tenantColumn } from '../../../platform/database/columns';
import { tenants } from '../../tenancy/infrastructure/schema';

export const uoms = pgTable(
  'uoms',
  {
    id: idColumn(),
    tenantId: tenantColumn().references(() => tenants.id),
    code: text('code').notNull(),
    name: jsonb('name').$type<{ en: string; ar?: string }>().notNull(),
    kind: text('kind', {
      enum: ['COUNT', 'TIME', 'WEIGHT', 'LENGTH', 'AREA', 'VOLUME', 'OTHER'],
    }).notNull(),
    /** Display precision; storage is always NUMERIC(20,6). */
    decimals: integer('decimals').notNull().default(0),
    ...auditColumns(),
  },
  (t) => [
    unique('uoms_tenant_code_uq').on(t.tenantId, t.code),
    unique('uoms_tenant_id_uq').on(t.tenantId, t.id),
  ],
);

export const itemCategories = pgTable(
  'item_categories',
  {
    id: idColumn(),
    tenantId: tenantColumn().references(() => tenants.id),
    code: text('code').notNull(),
    name: jsonb('name').$type<{ en: string; ar?: string }>().notNull(),
    parentId: uuid('parent_id'),
    /** Which industry pack seeded it (null = tenant-created). Informational. */
    sourcePackId: text('source_pack_id'),
    ...auditColumns(),
  },
  (t) => [
    unique('item_categories_tenant_code_uq').on(t.tenantId, t.code),
    unique('item_categories_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({ columns: [t.tenantId, t.parentId], foreignColumns: [t.tenantId, t.id] }),
  ],
);

/**
 * Universal item (ADR-005). Capability flags are columns so the database can enforce the
 * kind policy with CHECK constraints — no code path can create a service that tracks stock.
 */
export const items = pgTable(
  'items',
  {
    id: idColumn(),
    tenantId: tenantColumn().references(() => tenants.id),
    kind: text('kind', {
      enum: [
        'STOCKED_GOOD',
        'NONSTOCK_GOOD',
        'SERVICE',
        'DIGITAL_GOOD',
        'BUNDLE',
        'SUBSCRIPTION_PLAN',
        'RENTAL_ASSET',
        'MANUFACTURED_GOOD',
      ],
    }).notNull(),
    code: text('code').notNull(),
    codeNormalized: text('code_normalized').notNull(),
    name: jsonb('name').$type<{ en: string; ar?: string }>().notNull(),
    description: text('description'),
    categoryId: uuid('category_id'),
    baseUomId: uuid('base_uom_id').notNull(),
    status: text('status', { enum: ['DRAFT', 'ACTIVE', 'DISCONTINUED', 'ARCHIVED'] })
      .notNull()
      .default('ACTIVE'),
    trackInventory: boolean('track_inventory').notNull().default(false),
    trackLot: boolean('track_lot').notNull().default(false),
    trackSerial: boolean('track_serial').notNull().default(false),
    trackExpiry: boolean('track_expiry').notNull().default(false),
    trackLocation: boolean('track_location').notNull().default(false),
    isSellable: boolean('is_sellable').notNull().default(true),
    isPurchasable: boolean('is_purchasable').notNull().default(false),
    isBillable: boolean('is_billable').notNull().default(true),
    isTaxable: boolean('is_taxable').notNull().default(true),
    requiresFulfillment: boolean('requires_fulfillment').notNull().default(false),
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
    ...auditColumns(),
  },
  (t) => [
    unique('items_tenant_code_uq').on(t.tenantId, t.codeNormalized),
    unique('items_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.categoryId],
      foreignColumns: [itemCategories.tenantId, itemCategories.id],
    }),
    foreignKey({ columns: [t.tenantId, t.baseUomId], foreignColumns: [uoms.tenantId, uoms.id] }),
    index('items_tenant_kind_idx').on(t.tenantId, t.kind),
    index('items_tenant_status_idx').on(t.tenantId, t.status),
    // Mirrors ITEM_KIND_POLICIES: intangible kinds can never track stock/lot/serial/expiry/location.
    check(
      'items_intangible_no_tracking_ck',
      sql`(${t.kind} NOT IN ('SERVICE','DIGITAL_GOOD','BUNDLE','SUBSCRIPTION_PLAN'))
          OR (NOT ${t.trackInventory} AND NOT ${t.trackLot} AND NOT ${t.trackSerial} AND NOT ${t.trackExpiry} AND NOT ${t.trackLocation})`,
    ),
    check('items_lot_xor_serial_ck', sql`NOT (${t.trackLot} AND ${t.trackSerial})`),
    check('items_expiry_requires_lot_ck', sql`NOT ${t.trackExpiry} OR ${t.trackLot}`),
    check(
      'items_tracking_requires_inventory_ck',
      sql`${t.kind} = 'RENTAL_ASSET' OR NOT (${t.trackLot} OR ${t.trackSerial} OR ${t.trackExpiry}) OR ${t.trackInventory}`,
    ),
  ],
);

/** 0..1 per item; only physical kinds may have one (CHECK via trigger in migration). */
export const itemPhysicalProfiles = pgTable(
  'item_physical_profiles',
  {
    tenantId: tenantColumn(),
    itemId: uuid('item_id').notNull(),
    weightKg: numeric('weight_kg', { precision: 20, scale: 6 }),
    lengthCm: numeric('length_cm', { precision: 20, scale: 6 }),
    widthCm: numeric('width_cm', { precision: 20, scale: 6 }),
    heightCm: numeric('height_cm', { precision: 20, scale: 6 }),
    casePackQuantity: numeric('case_pack_quantity', { precision: 20, scale: 6 }),
    ...auditColumns(),
  },
  (t) => [
    unique('item_physical_profiles_uq').on(t.tenantId, t.itemId),
    foreignKey({
      columns: [t.tenantId, t.itemId],
      foreignColumns: [items.tenantId, items.id],
    }).onDelete('cascade'),
  ],
);

/** Barcodes are text — leading zeros preserved (T-022). Unique per tenant. */
export const itemBarcodes = pgTable(
  'item_barcodes',
  {
    id: idColumn(),
    tenantId: tenantColumn(),
    itemId: uuid('item_id').notNull(),
    value: text('value').notNull(),
    symbology: text('symbology').notNull().default('OTHER'),
    isPrimary: boolean('is_primary').notNull().default(false),
    ...auditColumns(),
  },
  (t) => [
    unique('item_barcodes_tenant_value_uq').on(t.tenantId, t.value),
    foreignKey({
      columns: [t.tenantId, t.itemId],
      foreignColumns: [items.tenantId, items.id],
    }).onDelete('cascade'),
    index('item_barcodes_item_idx').on(t.tenantId, t.itemId),
  ],
);

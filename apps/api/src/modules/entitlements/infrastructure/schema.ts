import {
  boolean,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns, idColumn, tenantColumn } from '../../../platform/database/columns';
import { companies } from '../../organization/infrastructure/schema';
import { tenants } from '../../tenancy/infrastructure/schema';

/** Tenant-level module switch (ADR-004). Core modules have a row with status 'enabled' that cannot be changed. */
export const moduleEntitlements = pgTable(
  'module_entitlements',
  {
    id: idColumn(),
    tenantId: tenantColumn().references(() => tenants.id),
    module: text('module').notNull(),
    status: text('status', { enum: ['enabled', 'disabled'] }).notNull(),
    enabledAt: timestamp('enabled_at', { withTimezone: true, mode: 'string' }),
    enabledBy: uuid('enabled_by'),
    disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'string' }),
    disabledBy: uuid('disabled_by'),
    reason: text('reason'),
    ...auditColumns(),
  },
  (t) => [unique('module_entitlements_tenant_module_uq').on(t.tenantId, t.module)],
);

/** Per-legal-entity narrowing of an enabled optional module. Absent row = inherits tenant setting. */
export const entityCapabilities = pgTable(
  'entity_capabilities',
  {
    id: idColumn(),
    tenantId: tenantColumn(),
    companyId: uuid('company_id').notNull(),
    module: text('module').notNull(),
    enabled: boolean('enabled').notNull(),
    reason: text('reason'),
    ...auditColumns(),
  },
  (t) => [
    unique('entity_capabilities_uq').on(t.tenantId, t.companyId, t.module),
    foreignKey({
      columns: [t.tenantId, t.companyId],
      foreignColumns: [companies.tenantId, companies.id],
    }),
    index('entity_capabilities_company_idx').on(t.tenantId, t.companyId),
  ],
);

export const tenantIndustryPacks = pgTable(
  'tenant_industry_packs',
  {
    id: idColumn(),
    tenantId: tenantColumn().references(() => tenants.id),
    packId: text('pack_id').notNull(),
    packVersion: text('pack_version').notNull(),
    status: text('status', { enum: ['installed', 'removed'] })
      .notNull()
      .default('installed'),
    installedAt: timestamp('installed_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    installedBy: uuid('installed_by'),
    removedAt: timestamp('removed_at', { withTimezone: true, mode: 'string' }),
    removedBy: uuid('removed_by'),
    ...auditColumns(),
  },
  (t) => [unique('tenant_industry_packs_uq').on(t.tenantId, t.packId)],
);

/** Immutable installation history: the exact diff applied (CORE-IND-003, MI-011). */
export const configInstallEvents = pgTable(
  'config_install_events',
  {
    id: idColumn(),
    tenantId: tenantColumn(),
    packId: text('pack_id').notNull(),
    fromVersion: text('from_version'),
    toVersion: text('to_version').notNull(),
    action: text('action', { enum: ['install', 'upgrade', 'remove'] }).notNull(),
    diff: jsonb('diff').$type<Record<string, unknown>>().notNull(),
    reason: text('reason').notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    appliedBy: uuid('applied_by'),
    requestId: text('request_id'),
  },
  (t) => [index('config_install_events_tenant_idx').on(t.tenantId, t.appliedAt)],
);

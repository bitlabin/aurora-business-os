import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns, idColumn, tenantColumn } from '../../../platform/database/columns';
import { companies } from '../../organization/infrastructure/schema';
import { tenants } from '../../tenancy/infrastructure/schema';

/**
 * Universal party master (CORE-IND-004, CRM-002). One identity per person/organization within
 * the tenant; roles are additive relations; commercial terms are per legal entity.
 */
export const parties = pgTable(
  'parties',
  {
    id: idColumn(),
    tenantId: tenantColumn().references(() => tenants.id),
    type: text('type', { enum: ['PERSON', 'ORGANIZATION'] }).notNull(),
    legalName: text('legal_name').notNull(),
    /** Normalized (lower-cased, whitespace-collapsed) for search and duplicate candidates. */
    legalNameNormalized: text('legal_name_normalized').notNull(),
    tradeName: text('trade_name'),
    primaryEmail: text('primary_email'),
    primaryEmailNormalized: text('primary_email_normalized'),
    primaryPhone: text('primary_phone'),
    countryCode: text('country_code'),
    taxRegistrationId: text('tax_registration_id'),
    status: text('status', { enum: ['ACTIVE', 'ON_HOLD', 'BLOCKED', 'ARCHIVED'] })
      .notNull()
      .default('ACTIVE'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
    ...auditColumns(),
  },
  (t) => [
    unique('parties_tenant_id_uq').on(t.tenantId, t.id),
    index('parties_tenant_name_idx').on(t.tenantId, t.legalNameNormalized),
    index('parties_tenant_email_idx').on(t.tenantId, t.primaryEmailNormalized),
    index('parties_tenant_phone_idx').on(t.tenantId, t.primaryPhone),
    index('parties_tenant_status_idx').on(t.tenantId, t.status),
  ],
);

export const partyRoles = pgTable(
  'party_roles',
  {
    tenantId: tenantColumn(),
    partyId: uuid('party_id').notNull(),
    role: text('role', {
      enum: ['PROSPECT', 'CUSTOMER', 'SUPPLIER', 'CONTRACTOR', 'CONTACT', 'EMPLOYEE'],
    }).notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    assignedBy: uuid('assigned_by'),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.partyId, t.role] }),
    foreignKey({
      columns: [t.tenantId, t.partyId],
      foreignColumns: [parties.tenantId, parties.id],
    }).onDelete('cascade'),
    index('party_roles_role_idx').on(t.tenantId, t.role),
  ],
);

/**
 * Commercial relationship per legal entity (FDD §1.5: contracts, credit, price lists and
 * balances are per entity). Phase 0 carries identity and status; credit/terms/price book
 * columns are added by the sales module in Phase 1.
 */
export const partyEntityAccounts = pgTable(
  'party_entity_accounts',
  {
    id: idColumn(),
    tenantId: tenantColumn(),
    companyId: uuid('company_id').notNull(),
    partyId: uuid('party_id').notNull(),
    accountCode: text('account_code').notNull(),
    status: text('status', {
      enum: ['PROSPECT', 'PENDING_VERIFICATION', 'ACTIVE', 'ON_HOLD', 'BLOCKED', 'ARCHIVED'],
    })
      .notNull()
      .default('ACTIVE'),
    currency: text('currency'),
    ...auditColumns(),
  },
  (t) => [
    unique('party_entity_accounts_uq').on(t.tenantId, t.companyId, t.partyId),
    unique('party_entity_accounts_code_uq').on(t.tenantId, t.companyId, t.accountCode),
    foreignKey({
      columns: [t.tenantId, t.companyId],
      foreignColumns: [companies.tenantId, companies.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.partyId],
      foreignColumns: [parties.tenantId, parties.id],
    }),
  ],
);

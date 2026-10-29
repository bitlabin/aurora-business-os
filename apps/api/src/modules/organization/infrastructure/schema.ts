import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns, idColumn, tenantColumn } from '../../../platform/database/columns';
import { tenants } from '../../tenancy/infrastructure/schema';

/**
 * Legal entity (FDD ORG-002). Each company has its own base currency, fiscal calendar,
 * accounting basis and industry profile. Base currency is frozen after the first posted
 * transaction (enforced by the ledger module in Phase 1).
 */
export const companies = pgTable(
  'companies',
  {
    id: idColumn(),
    tenantId: tenantColumn().references(() => tenants.id),
    code: text('code').notNull(),
    legalName: text('legal_name').notNull(),
    tradingName: text('trading_name'),
    countryCode: text('country_code').notNull(),
    baseCurrency: text('base_currency').notNull(),
    /** 1..12 — month in which the fiscal year starts. */
    fiscalYearStartMonth: integer('fiscal_year_start_month').notNull().default(1),
    accountingBasis: text('accounting_basis', { enum: ['ACCRUAL', 'CASH'] })
      .notNull()
      .default('ACCRUAL'),
    timezone: text('timezone').notNull().default('UTC'),
    /** Industry profile keys (industry pack ids); informational, entitlements are authoritative. */
    industryProfiles: jsonb('industry_profiles').$type<string[]>().notNull().default([]),
    status: text('status', { enum: ['active', 'inactive'] })
      .notNull()
      .default('active'),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    ...auditColumns(),
  },
  (t) => [
    unique('companies_tenant_code_uq').on(t.tenantId, t.code),
    unique('companies_tenant_id_uq').on(t.tenantId, t.id),
  ],
);

export const branches = pgTable(
  'branches',
  {
    id: idColumn(),
    tenantId: tenantColumn(),
    companyId: uuid('company_id').notNull(),
    code: text('code').notNull(),
    name: jsonb('name').$type<{ en: string; ar?: string }>().notNull(),
    status: text('status', { enum: ['active', 'inactive'] })
      .notNull()
      .default('active'),
    ...auditColumns(),
  },
  (t) => [
    unique('branches_company_code_uq').on(t.tenantId, t.companyId, t.code),
    unique('branches_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.companyId],
      foreignColumns: [companies.tenantId, companies.id],
    }),
    index('branches_company_idx').on(t.tenantId, t.companyId),
  ],
);

export const departments = pgTable(
  'departments',
  {
    id: idColumn(),
    tenantId: tenantColumn(),
    companyId: uuid('company_id').notNull(),
    code: text('code').notNull(),
    name: jsonb('name').$type<{ en: string; ar?: string }>().notNull(),
    parentId: uuid('parent_id'),
    status: text('status', { enum: ['active', 'inactive'] })
      .notNull()
      .default('active'),
    ...auditColumns(),
  },
  (t) => [
    unique('departments_company_code_uq').on(t.tenantId, t.companyId, t.code),
    unique('departments_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.companyId],
      foreignColumns: [companies.tenantId, companies.id],
    }),
  ],
);

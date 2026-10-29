import { foreignKey, index, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { auditColumns, idColumn, tenantColumn } from '../../../platform/database/columns';
import { companies } from '../../organization/infrastructure/schema';

/**
 * Phase 0 ships only the warehouse master so the inventory module exists as an entitlement-gated
 * surface (MI-004). Stock ledger, bins, lots and movements arrive in Phase 2 (INV-002..INV-013).
 */
export const warehouses = pgTable(
  'warehouses',
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
    unique('warehouses_company_code_uq').on(t.tenantId, t.companyId, t.code),
    unique('warehouses_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.companyId],
      foreignColumns: [companies.tenantId, companies.id],
    }),
    index('warehouses_company_idx').on(t.tenantId, t.companyId),
  ],
);

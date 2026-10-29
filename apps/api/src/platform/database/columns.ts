import { integer, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Column sets shared by every table (FDD §16.1): identity, tenant scope, audit stamps and an
 * optimistic-concurrency version. Row-level security policies are added in the SQL migration
 * for every table that carries `tenant_id` (ADR-001); `scripts/check-rls.ts` verifies it.
 */
export const idColumn = () => uuid('id').primaryKey();

export const tenantColumn = () => uuid('tenant_id').notNull();

export const auditColumns = () => ({
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  version: integer('version').notNull().default(1),
});

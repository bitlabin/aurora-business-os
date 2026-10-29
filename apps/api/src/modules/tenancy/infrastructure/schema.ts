import {
  boolean,
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
import { users } from '../../identity/infrastructure/schema';

/** Platform-level: the list of tenants is not itself tenant-scoped. */
export const tenants = pgTable('tenants', {
  id: idColumn(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  defaultLocale: text('default_locale').notNull().default('en'),
  defaultTimezone: text('default_timezone').notNull().default('UTC'),
  status: text('status', { enum: ['active', 'suspended', 'deleting'] })
    .notNull()
    .default('active'),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  ...auditColumns(),
});

/** A user's membership in a tenant. Tenant-owned → RLS. */
export const memberships = pgTable(
  'memberships',
  {
    id: idColumn(),
    tenantId: tenantColumn().references(() => tenants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: text('status', { enum: ['active', 'suspended'] })
      .notNull()
      .default('active'),
    ...auditColumns(),
  },
  (t) => [
    unique('memberships_tenant_user_uq').on(t.tenantId, t.userId),
    unique('memberships_tenant_id_uq').on(t.tenantId, t.id),
    index('memberships_user_idx').on(t.userId),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: idColumn(),
    tenantId: tenantColumn().references(() => tenants.id),
    key: text('key').notNull(),
    name: jsonb('name').$type<{ en: string; ar?: string }>().notNull(),
    /** Template roles are seeded from code (FDD §20); tenants edit copies. */
    templateKey: text('template_key'),
    isSystem: boolean('is_system').notNull().default(false),
    ...auditColumns(),
  },
  (t) => [
    unique('roles_tenant_key_uq').on(t.tenantId, t.key),
    unique('roles_tenant_id_uq').on(t.tenantId, t.id),
  ],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    tenantId: tenantColumn(),
    roleId: uuid('role_id').notNull(),
    permission: text('permission').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.roleId, t.permission] }),
    foreignKey({
      columns: [t.tenantId, t.roleId],
      foreignColumns: [roles.tenantId, roles.id],
    }).onDelete('cascade'),
  ],
);

export const membershipRoles = pgTable(
  'membership_roles',
  {
    tenantId: tenantColumn(),
    membershipId: uuid('membership_id').notNull(),
    roleId: uuid('role_id').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    grantedBy: uuid('granted_by'),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.membershipId, t.roleId] }),
    foreignKey({
      columns: [t.tenantId, t.membershipId],
      foreignColumns: [memberships.tenantId, memberships.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.tenantId, t.roleId],
      foreignColumns: [roles.tenantId, roles.id],
    }).onDelete('cascade'),
  ],
);

/**
 * ABAC scope grants (ADR-003): a membership reaches a company (and later branch, warehouse,
 * territory) only through an explicit grant. No grant → no access.
 */
export const userScopeGrants = pgTable(
  'user_scope_grants',
  {
    id: idColumn(),
    tenantId: tenantColumn(),
    membershipId: uuid('membership_id').notNull(),
    scopeType: text('scope_type', {
      enum: ['company', 'branch', 'warehouse', 'territory'],
    }).notNull(),
    scopeId: uuid('scope_id').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    grantedBy: uuid('granted_by'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => [
    unique('user_scope_grants_uq').on(t.tenantId, t.membershipId, t.scopeType, t.scopeId),
    foreignKey({
      columns: [t.tenantId, t.membershipId],
      foreignColumns: [memberships.tenantId, memberships.id],
    }).onDelete('cascade'),
    index('user_scope_grants_scope_idx').on(t.tenantId, t.scopeType, t.scopeId),
  ],
);

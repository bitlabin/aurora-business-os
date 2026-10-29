import { Injectable } from '@nestjs/common';
import {
  AppError,
  type CompanyId,
  type MembershipId,
  type PermissionKey,
  ROLE_TEMPLATES,
  type RoleId,
  type TenantId,
  isPermissionKey,
  newId,
} from '@aurora/types';
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { UnitOfWork } from '../../../platform/database/unit-of-work';
import { AuditService } from '../../audit';
import { OutboxService } from '../../../platform/events/outbox.service';
import {
  membershipRoles,
  memberships,
  rolePermissions,
  roles,
  tenants,
  userScopeGrants,
} from '../infrastructure/schema';

export interface TenantRecord {
  id: TenantId;
  slug: string;
  name: string;
  defaultLocale: string;
  status: 'active' | 'suspended' | 'deleting';
}

export interface ResolvedAccess {
  membershipId: MembershipId;
  permissions: Set<PermissionKey>;
  companyIds: Set<CompanyId>;
}

interface Actor {
  userId?: string | undefined;
  requestId?: string | undefined;
}

/**
 * Tenants, memberships, roles and scope grants (ADR-001, ADR-003). All writes are audited.
 * Reads that happen before a tenant is selected (login) use the user-scoped membership policy.
 */
@Injectable()
export class TenancyService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async createTenant(
    input: { slug: string; name: string; defaultLocale?: 'en' | 'ar'; defaultTimezone?: string },
    actor: Actor,
  ): Promise<TenantRecord> {
    const id = newId<TenantId>();
    return this.uow.run({ userId: actor.userId, requestId: actor.requestId }, async (db) => {
      const taken = await db.query.tenants.findFirst({ where: eq(tenants.slug, input.slug) });
      if (taken) throw AppError.conflict(`Tenant slug "${input.slug}" is already in use`);
      const [row] = await db
        .insert(tenants)
        .values({
          id,
          slug: input.slug,
          name: input.name,
          defaultLocale: input.defaultLocale ?? 'en',
          defaultTimezone: input.defaultTimezone ?? 'UTC',
          createdBy: actor.userId ?? null,
        })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return toTenant(row);
    });
  }

  async getTenant(tenantId: string): Promise<TenantRecord | null> {
    return this.uow.run({ tenantId }, async (db) => {
      const row = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
      return row ? toTenant(row) : null;
    });
  }

  async findTenantBySlug(slug: string): Promise<TenantRecord | null> {
    return this.uow.run({}, async (db) => {
      const row = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
      return row ? toTenant(row) : null;
    });
  }

  /** Seed the baseline role templates (FDD §20) into a tenant. Idempotent by role key. */
  async seedRoleTemplates(tenantId: string, actor: Actor): Promise<void> {
    await this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        for (const template of ROLE_TEMPLATES) {
          const existing = await db.query.roles.findFirst({
            where: and(eq(roles.tenantId, tenantId), eq(roles.key, template.key)),
          });
          if (existing) continue;
          const roleId = newId<RoleId>();
          await db.insert(roles).values({
            id: roleId,
            tenantId,
            key: template.key,
            name: template.name,
            templateKey: template.key,
            isSystem: true,
            createdBy: actor.userId ?? null,
          });
          await db
            .insert(rolePermissions)
            .values(template.permissions.map((permission) => ({ tenantId, roleId, permission })));
        }
      },
    );
  }

  /** Create a tenant role from an explicit permission list (used by industry packs and admins). */
  async createRole(
    tenantId: string,
    input: {
      key: string;
      name: { en: string; ar?: string };
      permissions: readonly PermissionKey[];
      templateKey?: string;
    },
    actor: Actor,
  ): Promise<RoleId> {
    return this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const existing = await db.query.roles.findFirst({
          where: and(eq(roles.tenantId, tenantId), eq(roles.key, input.key)),
        });
        if (existing) throw AppError.conflict(`Role "${input.key}" already exists`);
        const roleId = newId<RoleId>();
        await db.insert(roles).values({
          id: roleId,
          tenantId,
          key: input.key,
          name: input.name,
          templateKey: input.templateKey ?? null,
          isSystem: false,
          createdBy: actor.userId ?? null,
        });
        if (input.permissions.length > 0) {
          await db
            .insert(rolePermissions)
            .values(input.permissions.map((permission) => ({ tenantId, roleId, permission })));
        }
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'role.created',
          subjectType: 'role',
          subjectId: roleId,
          after: { key: input.key, permissions: [...input.permissions] },
          sensitive: true,
        });
        return roleId;
      },
    );
  }

  /** Memberships visible to a user before a tenant is selected (login). */
  async listMembershipsForUser(
    userId: string,
  ): Promise<{ membershipId: MembershipId; tenant: TenantRecord }[]> {
    return this.uow.run({ userId }, async (db) => {
      const rows = await db
        .select({ membershipId: memberships.id, tenant: tenants })
        .from(memberships)
        .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.status, 'active'),
            eq(tenants.status, 'active'),
          ),
        );
      return rows.map((r) => ({
        membershipId: r.membershipId as MembershipId,
        tenant: toTenant(r.tenant),
      }));
    });
  }

  async createMembership(tenantId: string, userId: string, actor: Actor): Promise<MembershipId> {
    const id = newId<MembershipId>();
    return this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const existing = await db.query.memberships.findFirst({
          where: and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)),
        });
        if (existing) return existing.id as MembershipId;
        await db
          .insert(memberships)
          .values({ id, tenantId, userId, createdBy: actor.userId ?? null });
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'membership.created',
          subjectType: 'membership',
          subjectId: id,
          after: { userId },
        });
        return id;
      },
    );
  }

  async assignRole(
    tenantId: string,
    membershipId: string,
    roleKey: string,
    actor: Actor,
  ): Promise<void> {
    await this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const role = await db.query.roles.findFirst({
          where: and(eq(roles.tenantId, tenantId), eq(roles.key, roleKey)),
        });
        if (!role) throw AppError.notFound(`Role "${roleKey}"`);
        const membership = await db.query.memberships.findFirst({
          where: and(eq(memberships.tenantId, tenantId), eq(memberships.id, membershipId)),
        });
        if (!membership) throw AppError.notFound('Membership');
        await db
          .insert(membershipRoles)
          .values({ tenantId, membershipId, roleId: role.id, grantedBy: actor.userId ?? null })
          .onConflictDoNothing();
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'membership.role_assigned',
          subjectType: 'membership',
          subjectId: membershipId,
          after: { roleKey },
          sensitive: true,
        });
        await this.outbox.publish({
          tenantId,
          domain: 'tenancy',
          type: 'membership.role_assigned',
          aggregateType: 'membership',
          aggregateId: membershipId,
          aggregateVersion: membership.version,
          payload: { roleKey },
          actorUserId: actor.userId,
          idempotencyKey: `membership.role_assigned:${membershipId}:${roleKey}`,
        });
      },
    );
  }

  async revokeRole(
    tenantId: string,
    membershipId: string,
    roleKey: string,
    actor: Actor,
  ): Promise<void> {
    await this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const role = await db.query.roles.findFirst({
          where: and(eq(roles.tenantId, tenantId), eq(roles.key, roleKey)),
        });
        if (!role) throw AppError.notFound(`Role "${roleKey}"`);
        await db
          .delete(membershipRoles)
          .where(
            and(
              eq(membershipRoles.tenantId, tenantId),
              eq(membershipRoles.membershipId, membershipId),
              eq(membershipRoles.roleId, role.id),
            ),
          );
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'membership.role_revoked',
          subjectType: 'membership',
          subjectId: membershipId,
          before: { roleKey },
          sensitive: true,
        });
      },
    );
  }

  async grantCompanyScope(
    tenantId: string,
    membershipId: string,
    companyId: string,
    actor: Actor,
  ): Promise<void> {
    await this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        await db
          .insert(userScopeGrants)
          .values({
            id: newId(),
            tenantId,
            membershipId,
            scopeType: 'company',
            scopeId: companyId,
            grantedBy: actor.userId ?? null,
          })
          .onConflictDoNothing();
        await this.audit.record({
          tenantId,
          companyId,
          actorUserId: actor.userId,
          action: 'membership.scope_granted',
          subjectType: 'membership',
          subjectId: membershipId,
          after: { scopeType: 'company', scopeId: companyId },
          sensitive: true,
        });
      },
    );
  }

  async revokeCompanyScope(
    tenantId: string,
    membershipId: string,
    companyId: string,
    actor: Actor,
  ): Promise<void> {
    await this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        await db
          .delete(userScopeGrants)
          .where(
            and(
              eq(userScopeGrants.tenantId, tenantId),
              eq(userScopeGrants.membershipId, membershipId),
              eq(userScopeGrants.scopeType, 'company'),
              eq(userScopeGrants.scopeId, companyId),
            ),
          );
        await this.audit.record({
          tenantId,
          companyId,
          actorUserId: actor.userId,
          action: 'membership.scope_revoked',
          subjectType: 'membership',
          subjectId: membershipId,
          before: { scopeType: 'company', scopeId: companyId },
          sensitive: true,
        });
      },
    );
  }

  /**
   * Effective permissions and company scopes for a user in a tenant — recomputed per request so
   * a revocation is effective immediately (T-020). Null when the user is not an active member.
   */
  async resolveAccess(tenantId: string, userId: string): Promise<ResolvedAccess | null> {
    return this.uow.run({ tenantId, userId }, async (db) => {
      const membership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.tenantId, tenantId),
          eq(memberships.userId, userId),
          eq(memberships.status, 'active'),
        ),
      });
      if (!membership) return null;

      const roleIds = (
        await db
          .select({ roleId: membershipRoles.roleId })
          .from(membershipRoles)
          .where(
            and(
              eq(membershipRoles.tenantId, tenantId),
              eq(membershipRoles.membershipId, membership.id),
            ),
          )
      ).map((r) => r.roleId);

      const permissions = new Set<PermissionKey>();
      if (roleIds.length > 0) {
        const rows = await db
          .select({ permission: rolePermissions.permission })
          .from(rolePermissions)
          .where(
            and(eq(rolePermissions.tenantId, tenantId), inArray(rolePermissions.roleId, roleIds)),
          );
        for (const r of rows) if (isPermissionKey(r.permission)) permissions.add(r.permission);
      }

      const now = new Date().toISOString();
      const scopes = await db
        .select({ scopeId: userScopeGrants.scopeId })
        .from(userScopeGrants)
        .where(
          and(
            eq(userScopeGrants.tenantId, tenantId),
            eq(userScopeGrants.membershipId, membership.id),
            eq(userScopeGrants.scopeType, 'company'),
            or(isNull(userScopeGrants.expiresAt), gt(userScopeGrants.expiresAt, now)),
          ),
        );

      return {
        membershipId: membership.id as MembershipId,
        permissions,
        companyIds: new Set(scopes.map((s) => s.scopeId as CompanyId)),
      };
    });
  }

  async listRoles(tenantId: string) {
    return this.uow.run({ tenantId }, async (db) => {
      const rows = await db.query.roles.findMany({ where: eq(roles.tenantId, tenantId) });
      const perms = await db
        .select()
        .from(rolePermissions)
        .where(eq(rolePermissions.tenantId, tenantId));
      return rows.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        isSystem: r.isSystem,
        permissions: perms.filter((p) => p.roleId === r.id).map((p) => p.permission),
      }));
    });
  }

  async listMembers(tenantId: string) {
    return this.uow.run({ tenantId }, async (db) => {
      const rows = await db.query.memberships.findMany({
        where: eq(memberships.tenantId, tenantId),
      });
      const mroles = await db
        .select({ membershipId: membershipRoles.membershipId, key: roles.key })
        .from(membershipRoles)
        .innerJoin(
          roles,
          and(eq(roles.tenantId, membershipRoles.tenantId), eq(roles.id, membershipRoles.roleId)),
        )
        .where(eq(membershipRoles.tenantId, tenantId));
      const scopes = await db
        .select({
          membershipId: userScopeGrants.membershipId,
          scopeType: userScopeGrants.scopeType,
          scopeId: userScopeGrants.scopeId,
        })
        .from(userScopeGrants)
        .where(eq(userScopeGrants.tenantId, tenantId));
      return rows.map((m) => ({
        id: m.id,
        userId: m.userId,
        status: m.status,
        roles: mroles.filter((r) => r.membershipId === m.id).map((r) => r.key),
        scopes: scopes
          .filter((s) => s.membershipId === m.id)
          .map((s) => ({ type: s.scopeType, id: s.scopeId })),
      }));
    });
  }
}

function toTenant(row: typeof tenants.$inferSelect): TenantRecord {
  return {
    id: row.id as TenantId,
    slug: row.slug,
    name: row.name,
    defaultLocale: row.defaultLocale,
    status: row.status,
  };
}

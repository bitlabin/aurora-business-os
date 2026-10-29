import { Injectable } from '@nestjs/common';
import {
  AppError,
  CORE_MODULES,
  type Entitlement,
  MODULES,
  type ModuleKey,
  isCoreModule,
  newId,
} from '@aurora/types';
import { and, eq } from 'drizzle-orm';
import { UnitOfWork } from '../../../platform/database/unit-of-work';
import { OutboxService } from '../../../platform/events/outbox.service';
import { AuditService } from '../../audit';
import { entityCapabilities, moduleEntitlements } from '../infrastructure/schema';

interface Actor {
  userId?: string | undefined;
  requestId?: string | undefined;
}

/**
 * A module registers a guard that can block its own deactivation while it has open
 * commitments (CORE-IND-007). Phase 0 ships the registry; inventory/AP guards arrive with
 * their modules in Phase 2.
 */
export interface DeactivationGuard {
  module: ModuleKey;
  /** Return human-readable blocking reasons; empty array means deactivation may proceed. */
  check(tenantId: string): Promise<string[]>;
}

@Injectable()
export class DeactivationGuardRegistry {
  private readonly guards: DeactivationGuard[] = [];

  register(guard: DeactivationGuard): void {
    this.guards.push(guard);
  }

  async blockers(tenantId: string, module: ModuleKey): Promise<string[]> {
    const reasons: string[] = [];
    for (const g of this.guards.filter((x) => x.module === module))
      reasons.push(...(await g.check(tenantId)));
    return reasons;
  }
}

/** Module entitlements at tenant level, narrowed per legal entity (ADR-004). */
@Injectable()
export class EntitlementService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly deactivation: DeactivationGuardRegistry,
  ) {}

  /** Core modules always exist as enabled rows; called at tenant provisioning. Idempotent. */
  async ensureCoreEntitlements(tenantId: string, actor: Actor): Promise<void> {
    await this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        for (const module of CORE_MODULES) {
          await db
            .insert(moduleEntitlements)
            .values({
              id: newId(),
              tenantId,
              module,
              status: 'enabled',
              enabledAt: new Date().toISOString(),
              enabledBy: actor.userId ?? null,
              reason: 'core',
              createdBy: actor.userId ?? null,
            })
            .onConflictDoNothing();
        }
      },
    );
  }

  async list(tenantId: string): Promise<Entitlement[]> {
    return this.uow.run({ tenantId }, async (db) => {
      const rows = await db.query.moduleEntitlements.findMany({
        where: eq(moduleEntitlements.tenantId, tenantId),
      });
      return MODULES.map((module) => {
        const row = rows.find((r) => r.module === module);
        const core = isCoreModule(module);
        return {
          module,
          core,
          enabled: core || row?.status === 'enabled',
          enabledAt: row?.enabledAt ?? null,
          disabledAt: row?.disabledAt ?? null,
          reason: row?.reason ?? null,
        };
      });
    });
  }

  /** Modules enabled for the tenant, narrowed to a company when one is given. */
  async effectiveModules(tenantId: string, companyId?: string): Promise<Set<ModuleKey>> {
    return this.uow.run({ tenantId }, async (db) => {
      const rows = await db.query.moduleEntitlements.findMany({
        where: and(
          eq(moduleEntitlements.tenantId, tenantId),
          eq(moduleEntitlements.status, 'enabled'),
        ),
      });
      const enabled = new Set<ModuleKey>(CORE_MODULES);
      for (const r of rows)
        if (MODULES.includes(r.module as ModuleKey)) enabled.add(r.module as ModuleKey);
      if (companyId) {
        const caps = await db.query.entityCapabilities.findMany({
          where: and(
            eq(entityCapabilities.tenantId, tenantId),
            eq(entityCapabilities.companyId, companyId),
          ),
        });
        for (const c of caps) {
          const m = c.module as ModuleKey;
          if (!isCoreModule(m) && !c.enabled) enabled.delete(m);
        }
      }
      return enabled;
    });
  }

  async isEnabled(tenantId: string, module: ModuleKey, companyId?: string): Promise<boolean> {
    return (await this.effectiveModules(tenantId, companyId)).has(module);
  }

  /** Throws MODULE_DISABLED (404) — used by jobs and services outside the HTTP guard chain. */
  async assertEnabled(tenantId: string, module: ModuleKey, companyId?: string): Promise<void> {
    if (!(await this.isEnabled(tenantId, module, companyId))) throw AppError.moduleDisabled();
  }

  async enable(tenantId: string, module: ModuleKey, reason: string, actor: Actor): Promise<void> {
    if (isCoreModule(module))
      throw AppError.businessRule(`${module} is a core module and is always enabled`);
    await this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const now = new Date().toISOString();
        const existing = await db.query.moduleEntitlements.findFirst({
          where: and(
            eq(moduleEntitlements.tenantId, tenantId),
            eq(moduleEntitlements.module, module),
          ),
        });
        if (existing?.status === 'enabled') return;
        if (existing) {
          await db
            .update(moduleEntitlements)
            .set({
              status: 'enabled',
              enabledAt: now,
              enabledBy: actor.userId ?? null,
              disabledAt: null,
              disabledBy: null,
              reason,
              updatedBy: actor.userId ?? null,
            })
            .where(eq(moduleEntitlements.id, existing.id));
        } else {
          await db
            .insert(moduleEntitlements)
            .values({
              id: newId(),
              tenantId,
              module,
              status: 'enabled',
              enabledAt: now,
              enabledBy: actor.userId ?? null,
              reason,
              createdBy: actor.userId ?? null,
            });
        }
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'entitlement.enabled',
          subjectType: 'module',
          subjectId: module,
          before: { status: existing?.status ?? 'absent' },
          after: { status: 'enabled' },
          reason,
          sensitive: true,
        });
        await this.outbox.publish({
          tenantId,
          domain: 'entitlements',
          type: 'entitlement.changed',
          aggregateType: 'module',
          aggregateId: module,
          aggregateVersion: (existing?.version ?? 0) + 1,
          payload: { status: 'enabled', reason },
          actorUserId: actor.userId,
          idempotencyKey: `entitlement.enabled:${module}:${now}`,
        });
      },
    );
  }

  async disable(tenantId: string, module: ModuleKey, reason: string, actor: Actor): Promise<void> {
    if (isCoreModule(module))
      throw AppError.businessRule(`${module} is a core module and cannot be disabled`);
    const blockers = await this.deactivation.blockers(tenantId, module);
    if (blockers.length > 0) {
      throw AppError.businessRule(
        `Cannot disable ${module}: ${blockers.join('; ')}`,
        blockers.map((b) => ({ path: 'module', message: b })),
      );
    }
    await this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const existing = await db.query.moduleEntitlements.findFirst({
          where: and(
            eq(moduleEntitlements.tenantId, tenantId),
            eq(moduleEntitlements.module, module),
          ),
        });
        if (!existing || existing.status === 'disabled') return;
        const now = new Date().toISOString();
        await db
          .update(moduleEntitlements)
          .set({
            status: 'disabled',
            disabledAt: now,
            disabledBy: actor.userId ?? null,
            reason,
            updatedBy: actor.userId ?? null,
          })
          .where(eq(moduleEntitlements.id, existing.id));
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'entitlement.disabled',
          subjectType: 'module',
          subjectId: module,
          before: { status: 'enabled' },
          after: { status: 'disabled' },
          reason,
          sensitive: true,
        });
        await this.outbox.publish({
          tenantId,
          domain: 'entitlements',
          type: 'entitlement.changed',
          aggregateType: 'module',
          aggregateId: module,
          aggregateVersion: existing.version + 1,
          payload: { status: 'disabled', reason },
          actorUserId: actor.userId,
          idempotencyKey: `entitlement.disabled:${module}:${now}`,
        });
      },
    );
  }

  async setEntityCapability(
    tenantId: string,
    companyId: string,
    module: ModuleKey,
    enabled: boolean,
    reason: string,
    actor: Actor,
  ): Promise<void> {
    if (isCoreModule(module))
      throw AppError.businessRule(`${module} is a core module and is always enabled`);
    await this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const existing = await db.query.entityCapabilities.findFirst({
          where: and(
            eq(entityCapabilities.tenantId, tenantId),
            eq(entityCapabilities.companyId, companyId),
            eq(entityCapabilities.module, module),
          ),
        });
        if (existing) {
          await db
            .update(entityCapabilities)
            .set({ enabled, reason, updatedBy: actor.userId ?? null })
            .where(eq(entityCapabilities.id, existing.id));
        } else {
          await db
            .insert(entityCapabilities)
            .values({
              id: newId(),
              tenantId,
              companyId,
              module,
              enabled,
              reason,
              createdBy: actor.userId ?? null,
            });
        }
        await this.audit.record({
          tenantId,
          companyId,
          actorUserId: actor.userId,
          action: 'entity_capability.changed',
          subjectType: 'module',
          subjectId: module,
          before: { enabled: existing?.enabled ?? null },
          after: { enabled },
          reason,
          sensitive: true,
        });
      },
    );
  }
}

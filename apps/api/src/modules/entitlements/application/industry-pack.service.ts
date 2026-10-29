import { Injectable } from '@nestjs/common';
import { AppError, type IndustryPackSummary, type PackDiff, newId } from '@aurora/types';
import { and, eq } from 'drizzle-orm';
import { UnitOfWork } from '../../../platform/database/unit-of-work';
import { OutboxService } from '../../../platform/events/outbox.service';
import { AuditService } from '../../audit';
import { CatalogService } from '../../catalog';
import { TenancyService } from '../../tenancy';
import { type IndustryPackManifest, type PackState, diffPack } from '../domain/industry-pack';
import { INDUSTRY_PACKS, findPack } from '../domain/packs';
import { configInstallEvents, tenantIndustryPacks } from '../infrastructure/schema';
import { EntitlementService } from './entitlement.service';

interface Actor {
  userId?: string | undefined;
  requestId?: string | undefined;
}

/**
 * Preview → approve → install of versioned industry packs (ADR-004, CORE-IND-003, MI-011).
 * Installation touches configuration tables only, inside one transaction, and records the
 * applied diff immutably.
 */
@Injectable()
export class IndustryPackService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly entitlements: EntitlementService,
    private readonly tenancy: TenancyService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(tenantId: string): Promise<IndustryPackSummary[]> {
    const installed = await this.uow.run({ tenantId }, (db) =>
      db.query.tenantIndustryPacks.findMany({ where: eq(tenantIndustryPacks.tenantId, tenantId) }),
    );
    return INDUSTRY_PACKS.map((p) => {
      const row = installed.find((r) => r.packId === p.id);
      return {
        id: p.id,
        version: p.version,
        name: p.name,
        description: p.description,
        modules: p.modules,
        installable: p.installable,
        installed: row
          ? { version: row.packVersion, installedAt: row.installedAt, status: row.status }
          : null,
      };
    });
  }

  async preview(
    tenantId: string,
    packId: string,
  ): Promise<PackDiff & { notes: IndustryPackManifest['notes'] }> {
    const pack = this.requirePack(packId);
    const state = await this.currentState(tenantId, pack);
    return { ...diffPack(pack, state), notes: pack.notes };
  }

  async install(
    tenantId: string,
    packId: string,
    expectedVersion: string,
    reason: string,
    actor: Actor,
  ): Promise<PackDiff> {
    const pack = this.requirePack(packId);
    if (pack.version !== expectedVersion) {
      throw AppError.conflict(
        `Pack ${packId} is at version ${pack.version}; preview again before installing`,
      );
    }
    return this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const state = await this.currentState(tenantId, pack);
        const diff = diffPack(pack, state);
        const blocking = diff.conflicts.filter((c) => c.kind !== 'already_installed');
        if (blocking.length > 0)
          throw AppError.businessRule(blocking.map((c) => c.message).join('; '));
        if (diff.conflicts.some((c) => c.kind === 'already_installed'))
          throw AppError.conflict(`${pack.id}@${pack.version} is already installed`);

        for (const module of diff.modulesToEnable) {
          await this.entitlements.enable(
            tenantId,
            module,
            `industry pack ${pack.id}@${pack.version}: ${reason}`,
            actor,
          );
        }
        for (const role of pack.roles.filter((r) => diff.rolesToCreate.includes(r.key))) {
          await this.tenancy.createRole(
            tenantId,
            {
              key: role.key,
              name: role.name,
              permissions: role.permissions,
              templateKey: `pack:${pack.id}`,
            },
            actor,
          );
        }
        if (diff.itemCategoriesToCreate.length > 0) {
          await this.catalog.ensureCategories(
            tenantId,
            pack.itemCategories
              .filter((c) => diff.itemCategoriesToCreate.includes(c.code))
              .map((c) => ({ ...c, sourcePackId: pack.id })),
            actor,
          );
        }

        const existing = await db.query.tenantIndustryPacks.findFirst({
          where: and(
            eq(tenantIndustryPacks.tenantId, tenantId),
            eq(tenantIndustryPacks.packId, pack.id),
          ),
        });
        const now = new Date().toISOString();
        if (existing) {
          await db
            .update(tenantIndustryPacks)
            .set({
              packVersion: pack.version,
              status: 'installed',
              installedAt: now,
              installedBy: actor.userId ?? null,
              removedAt: null,
              removedBy: null,
              updatedBy: actor.userId ?? null,
            })
            .where(eq(tenantIndustryPacks.id, existing.id));
        } else {
          await db.insert(tenantIndustryPacks).values({
            id: newId(),
            tenantId,
            packId: pack.id,
            packVersion: pack.version,
            installedBy: actor.userId ?? null,
            createdBy: actor.userId ?? null,
          });
        }
        await db.insert(configInstallEvents).values({
          id: newId(),
          tenantId,
          packId: pack.id,
          fromVersion: state.installedVersion,
          toVersion: pack.version,
          action: state.installedVersion ? 'upgrade' : 'install',
          diff: diff as unknown as Record<string, unknown>,
          reason,
          appliedBy: actor.userId ?? null,
          requestId: actor.requestId ?? null,
        });
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'industry_pack.installed',
          subjectType: 'industry_pack',
          subjectId: pack.id,
          before: { version: state.installedVersion },
          after: { version: pack.version },
          reason,
          sensitive: true,
        });
        await this.outbox.publish({
          tenantId,
          domain: 'entitlements',
          type: 'industry_pack.installed',
          aggregateType: 'industry_pack',
          aggregateId: pack.id,
          aggregateVersion: 1,
          payload: { version: pack.version },
          actorUserId: actor.userId,
          idempotencyKey: `industry_pack.installed:${pack.id}:${pack.version}:${now}`,
        });
        return diff;
      },
    );
  }

  /** Removes the pack record and disables its optional modules (subject to deactivation guards). History is retained. */
  async remove(tenantId: string, packId: string, reason: string, actor: Actor): Promise<void> {
    const pack = this.requirePack(packId);
    await this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const existing = await db.query.tenantIndustryPacks.findFirst({
          where: and(
            eq(tenantIndustryPacks.tenantId, tenantId),
            eq(tenantIndustryPacks.packId, pack.id),
            eq(tenantIndustryPacks.status, 'installed'),
          ),
        });
        if (!existing) throw AppError.notFound(`Installed pack ${packId}`);
        // Modules still needed by another installed pack stay enabled.
        const others = await db.query.tenantIndustryPacks.findMany({
          where: and(
            eq(tenantIndustryPacks.tenantId, tenantId),
            eq(tenantIndustryPacks.status, 'installed'),
          ),
        });
        const stillNeeded = new Set(
          others
            .filter((o) => o.packId !== pack.id)
            .flatMap((o) => findPack(o.packId)?.modules ?? []),
        );
        for (const module of pack.modules.filter((m) => !stillNeeded.has(m))) {
          await this.entitlements.disable(
            tenantId,
            module,
            `industry pack ${pack.id} removed: ${reason}`,
            actor,
          );
        }
        const now = new Date().toISOString();
        await db
          .update(tenantIndustryPacks)
          .set({
            status: 'removed',
            removedAt: now,
            removedBy: actor.userId ?? null,
            updatedBy: actor.userId ?? null,
          })
          .where(eq(tenantIndustryPacks.id, existing.id));
        await db.insert(configInstallEvents).values({
          id: newId(),
          tenantId,
          packId: pack.id,
          fromVersion: existing.packVersion,
          toVersion: existing.packVersion,
          action: 'remove',
          diff: { modulesDisabled: pack.modules.filter((m) => !stillNeeded.has(m)) },
          reason,
          appliedBy: actor.userId ?? null,
          requestId: actor.requestId ?? null,
        });
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'industry_pack.removed',
          subjectType: 'industry_pack',
          subjectId: pack.id,
          before: { version: existing.packVersion },
          after: null,
          reason,
          sensitive: true,
        });
      },
    );
  }

  private requirePack(packId: string): IndustryPackManifest {
    const pack = findPack(packId);
    if (!pack) throw AppError.notFound(`Industry pack "${packId}"`);
    return pack;
  }

  private async currentState(tenantId: string, pack: IndustryPackManifest): Promise<PackState> {
    const enabledModules = await this.entitlements.effectiveModules(tenantId);
    const roles = await this.tenancy.listRoles(tenantId);
    const categories = await this.catalog.listCategories(tenantId);
    const installed = await this.uow.run({ tenantId }, (db) =>
      db.query.tenantIndustryPacks.findFirst({
        where: and(
          eq(tenantIndustryPacks.tenantId, tenantId),
          eq(tenantIndustryPacks.packId, pack.id),
          eq(tenantIndustryPacks.status, 'installed'),
        ),
      }),
    );
    return {
      enabledModules,
      existingRoleKeys: new Set(roles.map((r) => r.key)),
      existingCategoryCodes: new Set(categories.map((c) => c.code)),
      installedVersion: installed?.packVersion ?? null,
    };
  }
}

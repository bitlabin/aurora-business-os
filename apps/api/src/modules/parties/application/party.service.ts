import { Injectable } from '@nestjs/common';
import {
  AppError,
  type CreatePartyRequest,
  type Party,
  type PartyId,
  type PartyListQuery,
  type PartyRole,
  type UpdatePartyRequest,
  newId,
} from '@aurora/types';
import { and, asc, eq, gt, ilike, inArray, or, sql } from 'drizzle-orm';
import { UnitOfWork } from '../../../platform/database/unit-of-work';
import { OutboxService } from '../../../platform/events/outbox.service';
import { decodeCursor, page } from '../../../platform/http/cursor';
import { AuditService } from '../../audit';
import { normalizeEmail, normalizeName } from '../domain/party';
import { parties, partyRoles } from '../infrastructure/schema';

interface Actor {
  userId?: string | undefined;
  requestId?: string | undefined;
}

/** Universal party master (CORE-IND-004, CRM-002). */
@Injectable()
export class PartyService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async create(tenantId: string, input: CreatePartyRequest, actor: Actor): Promise<Party> {
    const id = newId<PartyId>();
    return this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const [row] = await db
          .insert(parties)
          .values({
            id,
            tenantId,
            type: input.type,
            legalName: input.legalName,
            legalNameNormalized: normalizeName(input.legalName),
            tradeName: input.tradeName ?? null,
            primaryEmail: input.primaryEmail ?? null,
            primaryEmailNormalized: input.primaryEmail ? normalizeEmail(input.primaryEmail) : null,
            primaryPhone: input.primaryPhone ?? null,
            countryCode: input.countryCode ?? null,
            taxRegistrationId: input.taxRegistrationId ?? null,
            tags: input.tags,
            customFields: input.customFields,
            createdBy: actor.userId ?? null,
          })
          .returning();
        if (!row) throw new Error('insert returned no row');
        const roles = [...new Set(input.roles)];
        await db
          .insert(partyRoles)
          .values(
            roles.map((role) => ({
              tenantId,
              partyId: id,
              role,
              assignedBy: actor.userId ?? null,
            })),
          );
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'party.created',
          subjectType: 'party',
          subjectId: id,
          after: { type: input.type, legalName: input.legalName, roles },
        });
        await this.outbox.publish({
          tenantId,
          domain: 'crm',
          type: 'party.created',
          aggregateType: 'party',
          aggregateId: id,
          aggregateVersion: 1,
          payload: { type: input.type, roles },
          actorUserId: actor.userId,
        });
        return toParty(row, roles);
      },
    );
  }

  async update(
    tenantId: string,
    partyId: string,
    input: UpdatePartyRequest,
    expectedVersion: number | undefined,
    actor: Actor,
  ): Promise<Party> {
    return this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const current = await db.query.parties.findFirst({
          where: and(eq(parties.tenantId, tenantId), eq(parties.id, partyId)),
        });
        if (!current) throw AppError.notFound('Party');
        if (expectedVersion !== undefined && current.version !== expectedVersion)
          throw AppError.versionConflict(current.version);
        const legalName = input.legalName ?? current.legalName;
        const primaryEmail =
          input.primaryEmail === undefined ? current.primaryEmail : input.primaryEmail;
        const primaryPhone =
          input.primaryPhone === undefined ? current.primaryPhone : input.primaryPhone;
        if (!primaryEmail && !primaryPhone)
          throw AppError.businessRule('At least one contact channel (email or phone) is required', [
            { path: 'primaryEmail', message: 'required' },
          ]);
        const [row] = await db
          .update(parties)
          .set({
            type: input.type ?? current.type,
            legalName,
            legalNameNormalized: normalizeName(legalName),
            tradeName: input.tradeName === undefined ? current.tradeName : input.tradeName,
            primaryEmail,
            primaryEmailNormalized: primaryEmail ? normalizeEmail(primaryEmail) : null,
            primaryPhone,
            countryCode: input.countryCode === undefined ? current.countryCode : input.countryCode,
            taxRegistrationId:
              input.taxRegistrationId === undefined
                ? current.taxRegistrationId
                : input.taxRegistrationId,
            tags: input.tags ?? current.tags,
            customFields: input.customFields ?? current.customFields,
            updatedBy: actor.userId ?? null,
          })
          .where(
            and(
              eq(parties.tenantId, tenantId),
              eq(parties.id, partyId),
              eq(parties.version, current.version),
            ),
          )
          .returning();
        if (!row) throw AppError.versionConflict(current.version);
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'party.updated',
          subjectType: 'party',
          subjectId: partyId,
          before: { legalName: current.legalName },
          after: { legalName },
        });
        await this.outbox.publish({
          tenantId,
          domain: 'crm',
          type: 'party.updated',
          aggregateType: 'party',
          aggregateId: partyId,
          aggregateVersion: row.version,
          payload: {},
          actorUserId: actor.userId,
        });
        return toParty(row, await this.rolesOf(tenantId, partyId));
      },
    );
  }

  async addRole(tenantId: string, partyId: string, role: PartyRole, actor: Actor): Promise<Party> {
    return this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const current = await db.query.parties.findFirst({
          where: and(eq(parties.tenantId, tenantId), eq(parties.id, partyId)),
        });
        if (!current) throw AppError.notFound('Party');
        await db
          .insert(partyRoles)
          .values({ tenantId, partyId, role, assignedBy: actor.userId ?? null })
          .onConflictDoNothing();
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'party.role_added',
          subjectType: 'party',
          subjectId: partyId,
          after: { role },
        });
        return toParty(current, await this.rolesOf(tenantId, partyId));
      },
    );
  }

  async get(tenantId: string, partyId: string): Promise<Party | null> {
    return this.uow.run({ tenantId }, async (db) => {
      const row = await db.query.parties.findFirst({
        where: and(eq(parties.tenantId, tenantId), eq(parties.id, partyId)),
      });
      return row ? toParty(row, await this.rolesOf(tenantId, partyId)) : null;
    });
  }

  async list(
    tenantId: string,
    query: PartyListQuery,
  ): Promise<{ items: Party[]; nextCursor: string | null }> {
    return this.uow.run({ tenantId }, async (db) => {
      const conditions = [eq(parties.tenantId, tenantId)];
      const after = decodeCursor(query.cursor);
      if (after) conditions.push(gt(parties.id, after));
      if (query.status) conditions.push(eq(parties.status, query.status));
      if (query.type) conditions.push(eq(parties.type, query.type));
      if (query.q) {
        const term = `%${normalizeName(query.q).replace(/[%_]/g, '\\$&')}%`;
        conditions.push(
          or(
            ilike(parties.legalNameNormalized, term),
            ilike(parties.primaryEmailNormalized, term),
            ilike(parties.primaryPhone, term),
          ) ?? sql`true`,
        );
      }
      if (query.role) {
        const ids = await db
          .select({ id: partyRoles.partyId })
          .from(partyRoles)
          .where(and(eq(partyRoles.tenantId, tenantId), eq(partyRoles.role, query.role)));
        if (ids.length === 0) return { items: [], nextCursor: null };
        conditions.push(
          inArray(
            parties.id,
            ids.map((r) => r.id),
          ),
        );
      }
      const rows = await db
        .select()
        .from(parties)
        .where(and(...conditions))
        .orderBy(asc(parties.id))
        .limit(query.limit + 1);
      const roleRows =
        rows.length > 0
          ? await db
              .select()
              .from(partyRoles)
              .where(
                and(
                  eq(partyRoles.tenantId, tenantId),
                  inArray(
                    partyRoles.partyId,
                    rows.map((r) => r.id),
                  ),
                ),
              )
          : [];
      const mapped = rows.map((r) =>
        toParty(
          r,
          roleRows.filter((x) => x.partyId === r.id).map((x) => x.role),
        ),
      );
      return page(mapped, query.limit);
    });
  }

  async archive(tenantId: string, partyId: string, actor: Actor): Promise<void> {
    await this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const current = await db.query.parties.findFirst({
          where: and(eq(parties.tenantId, tenantId), eq(parties.id, partyId)),
        });
        if (!current) throw AppError.notFound('Party');
        if (current.status === 'ARCHIVED') return;
        await db
          .update(parties)
          .set({ status: 'ARCHIVED', updatedBy: actor.userId ?? null })
          .where(eq(parties.id, partyId));
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'party.archived',
          subjectType: 'party',
          subjectId: partyId,
          before: { status: current.status },
          after: { status: 'ARCHIVED' },
        });
      },
    );
  }

  private async rolesOf(tenantId: string, partyId: string): Promise<PartyRole[]> {
    const rows = await this.uow.db
      .select({ role: partyRoles.role })
      .from(partyRoles)
      .where(and(eq(partyRoles.tenantId, tenantId), eq(partyRoles.partyId, partyId)));
    return rows.map((r) => r.role);
  }
}

function toParty(row: typeof parties.$inferSelect, roles: PartyRole[]): Party {
  return {
    id: row.id,
    tenantId: row.tenantId,
    type: row.type,
    legalName: row.legalName,
    tradeName: row.tradeName,
    primaryEmail: row.primaryEmail,
    primaryPhone: row.primaryPhone,
    countryCode: row.countryCode,
    taxRegistrationId: row.taxRegistrationId,
    status: row.status,
    roles,
    tags: row.tags,
    customFields: row.customFields as Record<string, string | number | boolean | null>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}

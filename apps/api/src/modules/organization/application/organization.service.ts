import { Injectable } from '@nestjs/common';
import {
  AppError,
  type CompanyId,
  type CompanySummary,
  assertCurrency,
  newId,
} from '@aurora/types';
import { and, eq, inArray } from 'drizzle-orm';
import { UnitOfWork } from '../../../platform/database/unit-of-work';
import { OutboxService } from '../../../platform/events/outbox.service';
import { AuditService } from '../../audit';
import { companies } from '../infrastructure/schema';

export interface CreateCompanyInput {
  code: string;
  legalName: string;
  tradingName?: string | null;
  countryCode: string;
  baseCurrency: string;
  fiscalYearStartMonth?: number;
  accountingBasis?: 'ACCRUAL' | 'CASH';
  timezone?: string;
  industryProfiles?: string[];
}

interface Actor {
  userId?: string | undefined;
  requestId?: string | undefined;
}

/** Legal entities (ORG-002). */
@Injectable()
export class OrganizationService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async createCompany(
    tenantId: string,
    input: CreateCompanyInput,
    actor: Actor,
  ): Promise<CompanySummary> {
    assertCurrency(input.baseCurrency);
    const id = newId<CompanyId>();
    return this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const dup = await db.query.companies.findFirst({
          where: and(eq(companies.tenantId, tenantId), eq(companies.code, input.code)),
        });
        if (dup) throw AppError.conflict(`Company code "${input.code}" already exists`);
        const [row] = await db
          .insert(companies)
          .values({
            id,
            tenantId,
            code: input.code,
            legalName: input.legalName,
            tradingName: input.tradingName ?? null,
            countryCode: input.countryCode,
            baseCurrency: input.baseCurrency,
            fiscalYearStartMonth: input.fiscalYearStartMonth ?? 1,
            accountingBasis: input.accountingBasis ?? 'ACCRUAL',
            timezone: input.timezone ?? 'UTC',
            industryProfiles: input.industryProfiles ?? [],
            createdBy: actor.userId ?? null,
          })
          .returning();
        if (!row) throw new Error('insert returned no row');
        await this.audit.record({
          tenantId,
          companyId: id,
          actorUserId: actor.userId,
          action: 'company.created',
          subjectType: 'company',
          subjectId: id,
          after: { code: input.code, legalName: input.legalName, baseCurrency: input.baseCurrency },
        });
        await this.outbox.publish({
          tenantId,
          companyId: id,
          domain: 'organization',
          type: 'company.created',
          aggregateType: 'company',
          aggregateId: id,
          aggregateVersion: 1,
          payload: { code: input.code },
          actorUserId: actor.userId,
        });
        return toSummary(row);
      },
    );
  }

  async listCompanies(tenantId: string, onlyIds?: ReadonlySet<string>): Promise<CompanySummary[]> {
    return this.uow.run({ tenantId }, async (db) => {
      const ids = onlyIds ? [...onlyIds] : undefined;
      if (ids?.length === 0) return [];
      const rows = await db.query.companies.findMany({
        where: ids
          ? and(eq(companies.tenantId, tenantId), inArray(companies.id, ids))
          : eq(companies.tenantId, tenantId),
        orderBy: companies.code,
      });
      return rows.map(toSummary);
    });
  }

  async getCompany(
    tenantId: string,
    companyId: string,
  ): Promise<
    | (CompanySummary & {
        fiscalYearStartMonth: number;
        accountingBasis: string;
        timezone: string;
        industryProfiles: string[];
      })
    | null
  > {
    return this.uow.run({ tenantId }, async (db) => {
      const row = await db.query.companies.findFirst({
        where: and(eq(companies.tenantId, tenantId), eq(companies.id, companyId)),
      });
      return row
        ? {
            ...toSummary(row),
            fiscalYearStartMonth: row.fiscalYearStartMonth,
            accountingBasis: row.accountingBasis,
            timezone: row.timezone,
            industryProfiles: row.industryProfiles,
          }
        : null;
    });
  }
}

function toSummary(row: typeof companies.$inferSelect): CompanySummary {
  return {
    id: row.id,
    code: row.code,
    legalName: row.legalName,
    tradingName: row.tradingName,
    baseCurrency: row.baseCurrency,
    countryCode: row.countryCode,
  };
}

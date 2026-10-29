import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppError } from '@aurora/types';
import { z } from 'zod';
import {
  CompanyScoped,
  Ctx,
  RequirePermission,
  type RequestContext,
} from '../../../platform/auth/request-context';
import { ZodBody, ZodParam } from '../../../platform/http/zod';
import { OrganizationService } from '../application/organization.service';

const createCompanyBody = z
  .object({
    code: z.string().trim().min(1).max(32),
    legalName: z.string().trim().min(1).max(200),
    tradingName: z.string().trim().min(1).max(200).nullable().optional(),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    baseCurrency: z.string().regex(/^[A-Z]{3}$/),
    fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
    accountingBasis: z.enum(['ACCRUAL', 'CASH']).optional(),
    timezone: z.string().min(1).max(64).optional(),
    industryProfiles: z.array(z.string().max(40)).max(10).optional(),
  })
  .strict();

@ApiTags('organization')
@Controller('companies')
@CompanyScoped(false)
export class CompaniesController {
  constructor(private readonly organization: OrganizationService) {}

  /** Companies the caller is scoped to — never the whole tenant unless they hold admin.company.read. */
  @Get()
  list(@Ctx() ctx: RequestContext) {
    const all = ctx.permissions.has('admin.company.read');
    return this.organization.listCompanies(ctx.tenant.id, all ? undefined : ctx.companyScopes);
  }

  @Get(':companyId')
  async get(@Ctx() ctx: RequestContext, @ZodParam('companyId', z.uuid()) companyId: string) {
    if (!ctx.companyScopes.has(companyId as never) && !ctx.permissions.has('admin.company.read')) {
      throw AppError.notFound('Company');
    }
    const company = await this.organization.getCompany(ctx.tenant.id, companyId);
    if (!company) throw AppError.notFound('Company');
    return company;
  }

  @Post()
  @RequirePermission('admin.company.manage')
  create(
    @Ctx() ctx: RequestContext,
    @ZodBody(createCompanyBody) body: z.infer<typeof createCompanyBody>,
  ) {
    return this.organization.createCompany(ctx.tenant.id, body, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
  }
}

import { Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  CompanyScoped,
  Ctx,
  RequirePermission,
  type RequestContext,
} from '../../../platform/auth/request-context';
import { ZodBody, ZodParam } from '../../../platform/http/zod';
import { TenancyService } from '../application/tenancy.service';

const roleBody = z.object({ roleKey: z.string().min(1).max(64) }).strict();
const scopeBody = z.object({ companyId: z.uuid() }).strict();

@ApiTags('admin')
@Controller('admin')
@CompanyScoped(false)
export class TenancyAdminController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get('tenant')
  @RequirePermission('admin.tenant.read')
  tenant(@Ctx() ctx: RequestContext) {
    return this.tenancy.getTenant(ctx.tenant.id);
  }

  @Get('roles')
  @RequirePermission('admin.role.read')
  roles(@Ctx() ctx: RequestContext) {
    return this.tenancy.listRoles(ctx.tenant.id);
  }

  @Get('members')
  @RequirePermission('admin.user.read')
  members(@Ctx() ctx: RequestContext) {
    return this.tenancy.listMembers(ctx.tenant.id);
  }

  @Post('members/:membershipId/roles')
  @HttpCode(200)
  @RequirePermission('admin.user.manage')
  async assignRole(
    @Ctx() ctx: RequestContext,
    @ZodParam('membershipId', z.uuid()) membershipId: string,
    @ZodBody(roleBody) body: z.infer<typeof roleBody>,
  ) {
    await this.tenancy.assignRole(ctx.tenant.id, membershipId, body.roleKey, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
    return { ok: true };
  }

  @Delete('members/:membershipId/roles/:roleKey')
  @RequirePermission('admin.user.manage')
  async revokeRole(
    @Ctx() ctx: RequestContext,
    @ZodParam('membershipId', z.uuid()) membershipId: string,
    @ZodParam('roleKey', z.string().min(1).max(64)) roleKey: string,
  ) {
    await this.tenancy.revokeRole(ctx.tenant.id, membershipId, roleKey, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
    return { ok: true };
  }

  @Post('members/:membershipId/scopes')
  @HttpCode(200)
  @RequirePermission('admin.user.manage')
  async grantScope(
    @Ctx() ctx: RequestContext,
    @ZodParam('membershipId', z.uuid()) membershipId: string,
    @ZodBody(scopeBody) body: z.infer<typeof scopeBody>,
  ) {
    await this.tenancy.grantCompanyScope(ctx.tenant.id, membershipId, body.companyId, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
    return { ok: true };
  }

  @Delete('members/:membershipId/scopes/:companyId')
  @RequirePermission('admin.user.manage')
  async revokeScope(
    @Ctx() ctx: RequestContext,
    @ZodParam('membershipId', z.uuid()) membershipId: string,
    @ZodParam('companyId', z.uuid()) companyId: string,
  ) {
    await this.tenancy.revokeCompanyScope(ctx.tenant.id, membershipId, companyId, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
    return { ok: true };
  }
}

import { Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type CapabilitiesResponse,
  changeEntitlementRequestSchema,
  industryPackIdSchema,
  installPackRequestSchema,
  moduleKeySchema,
  setEntityCapabilityRequestSchema,
} from '@aurora/types';
import type { z } from 'zod';
import {
  CompanyScoped,
  Ctx,
  RequirePermission,
  type RequestContext,
} from '../../../platform/auth/request-context';
import { ZodBody, ZodParam } from '../../../platform/http/zod';
import { buildNavigation, buildQuickCreate } from '../domain/navigation';
import { EntitlementService } from '../application/entitlement.service';
import { IndustryPackService } from '../application/industry-pack.service';

/** Effective modules + navigation for the current user and company (F-API-001). */
@ApiTags('capabilities')
@Controller('capabilities')
export class CapabilitiesController {
  @Get()
  capabilities(@Ctx() ctx: RequestContext): CapabilitiesResponse {
    return {
      companyId: ctx.companyId as string,
      modules: [...ctx.modules],
      permissions: [...ctx.permissions],
      navigation: buildNavigation(ctx.modules, ctx.permissions),
      quickCreate: buildQuickCreate(ctx.modules, ctx.permissions),
    };
  }
}

@ApiTags('admin')
@Controller('admin/entitlements')
@CompanyScoped(false)
export class EntitlementsAdminController {
  constructor(private readonly entitlements: EntitlementService) {}

  @Get()
  @RequirePermission('admin.entitlement.read')
  async list(@Ctx() ctx: RequestContext) {
    return { tenantId: ctx.tenant.id, entitlements: await this.entitlements.list(ctx.tenant.id) };
  }

  @Post(':module/enable')
  @HttpCode(200)
  @RequirePermission('admin.entitlement.manage')
  async enable(
    @Ctx() ctx: RequestContext,
    @ZodParam('module', moduleKeySchema) module: z.infer<typeof moduleKeySchema>,
    @ZodBody(changeEntitlementRequestSchema) body: z.infer<typeof changeEntitlementRequestSchema>,
  ) {
    await this.entitlements.enable(ctx.tenant.id, module, body.reason, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
    return { ok: true };
  }

  @Post(':module/disable')
  @HttpCode(200)
  @RequirePermission('admin.entitlement.manage')
  async disable(
    @Ctx() ctx: RequestContext,
    @ZodParam('module', moduleKeySchema) module: z.infer<typeof moduleKeySchema>,
    @ZodBody(changeEntitlementRequestSchema) body: z.infer<typeof changeEntitlementRequestSchema>,
  ) {
    await this.entitlements.disable(ctx.tenant.id, module, body.reason, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
    return { ok: true };
  }

  @Post(':module/entity-capability')
  @HttpCode(200)
  @RequirePermission('admin.entitlement.manage')
  async entityCapability(
    @Ctx() ctx: RequestContext,
    @ZodParam('module', moduleKeySchema) module: z.infer<typeof moduleKeySchema>,
    @ZodBody(setEntityCapabilityRequestSchema)
    body: z.infer<typeof setEntityCapabilityRequestSchema>,
  ) {
    await this.entitlements.setEntityCapability(
      ctx.tenant.id,
      body.companyId,
      module,
      body.enabled,
      body.reason,
      { userId: ctx.user.id, requestId: ctx.requestId },
    );
    return { ok: true };
  }
}

@ApiTags('admin')
@Controller('industry-packs')
@CompanyScoped(false)
export class IndustryPacksController {
  constructor(private readonly packs: IndustryPackService) {}

  @Get()
  @RequirePermission('admin.industry_pack.read')
  list(@Ctx() ctx: RequestContext) {
    return this.packs.list(ctx.tenant.id);
  }

  @Post(':packId/preview')
  @HttpCode(200)
  @RequirePermission('admin.industry_pack.read')
  preview(
    @Ctx() ctx: RequestContext,
    @ZodParam('packId', industryPackIdSchema) packId: z.infer<typeof industryPackIdSchema>,
  ) {
    return this.packs.preview(ctx.tenant.id, packId);
  }

  @Post(':packId/install')
  @HttpCode(200)
  @RequirePermission('admin.industry_pack.install')
  install(
    @Ctx() ctx: RequestContext,
    @ZodParam('packId', industryPackIdSchema) packId: z.infer<typeof industryPackIdSchema>,
    @ZodBody(installPackRequestSchema) body: z.infer<typeof installPackRequestSchema>,
  ) {
    return this.packs.install(ctx.tenant.id, packId, body.version, body.reason, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
  }

  @Delete(':packId')
  @RequirePermission('admin.industry_pack.install')
  async remove(
    @Ctx() ctx: RequestContext,
    @ZodParam('packId', industryPackIdSchema) packId: z.infer<typeof industryPackIdSchema>,
    @ZodBody(changeEntitlementRequestSchema) body: z.infer<typeof changeEntitlementRequestSchema>,
  ) {
    await this.packs.remove(ctx.tenant.id, packId, body.reason, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
    return { ok: true };
  }
}

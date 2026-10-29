import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { localizedTextSchema } from '@aurora/types';
import { z } from 'zod';
import {
  Ctx,
  RequireModule,
  RequirePermission,
  type RequestContext,
} from '../../../platform/auth/request-context';
import { ZodBody } from '../../../platform/http/zod';
import { WarehouseService } from '../application/warehouse.service';

const createWarehouseBody = z
  .object({ code: z.string().trim().min(1).max(32), name: localizedTextSchema })
  .strict();

/**
 * The whole controller is gated on the inventory module (ADR-004): for a company without it,
 * every route here answers 404 MODULE_DISABLED before any permission check (MI-004).
 */
@ApiTags('inventory')
@Controller('warehouses')
@RequireModule('inventory')
export class WarehousesController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get()
  @RequirePermission('inventory.warehouse.read')
  list(@Ctx() ctx: RequestContext) {
    return this.warehouseService.list(ctx.tenant.id, ctx.companyId as string);
  }

  @Post()
  @RequirePermission('inventory.warehouse.manage')
  create(
    @Ctx() ctx: RequestContext,
    @ZodBody(createWarehouseBody) body: z.infer<typeof createWarehouseBody>,
  ) {
    return this.warehouseService.create(ctx.tenant.id, ctx.companyId as string, body, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
  }
}

import { Controller, Delete, Get, Headers, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AppError,
  createItemCategoryRequestSchema,
  createItemRequestSchema,
  itemListQuerySchema,
  updateItemRequestSchema,
} from '@aurora/types';
import { z } from 'zod';
import {
  Ctx,
  RequirePermission,
  type RequestContext,
} from '../../../platform/auth/request-context';
import { ZodBody, ZodParam, ZodQuery } from '../../../platform/http/zod';
import { CatalogService } from '../application/catalog.service';

function parseIfMatch(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const m = /^"?(?:version-)?(\d+)"?$/.exec(value.trim());
  if (!m)
    throw AppError.validation([
      { path: 'If-Match', message: 'Expected a record version, e.g. "version-3"' },
    ]);
  return Number(m[1]);
}

/** Items are tenant-level master data; company context is still required because kind rules depend on the company's modules. */
@ApiTags('catalog')
@Controller('items')
export class ItemsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermission('catalog.item.read')
  list(
    @Ctx() ctx: RequestContext,
    @ZodQuery(itemListQuerySchema) query: z.infer<typeof itemListQuerySchema>,
  ) {
    return this.catalog.listItems(ctx.tenant.id, query);
  }

  @Get(':itemId')
  @RequirePermission('catalog.item.read')
  async get(@Ctx() ctx: RequestContext, @ZodParam('itemId', z.uuid()) itemId: string) {
    const item = await this.catalog.getItem(ctx.tenant.id, itemId);
    if (!item) throw AppError.notFound('Item');
    return item;
  }

  @Post()
  @RequirePermission('catalog.item.create')
  create(
    @Ctx() ctx: RequestContext,
    @ZodBody(createItemRequestSchema) body: z.infer<typeof createItemRequestSchema>,
  ) {
    return this.catalog.createItem(ctx.tenant.id, body, ctx.modules, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
  }

  @Patch(':itemId')
  @RequirePermission('catalog.item.update')
  update(
    @Ctx() ctx: RequestContext,
    @ZodParam('itemId', z.uuid()) itemId: string,
    @ZodBody(updateItemRequestSchema) body: z.infer<typeof updateItemRequestSchema>,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.catalog.updateItem(
      ctx.tenant.id,
      itemId,
      body,
      parseIfMatch(ifMatch),
      ctx.modules,
      { userId: ctx.user.id, requestId: ctx.requestId },
    );
  }

  @Delete(':itemId')
  @RequirePermission('catalog.item.archive')
  async archive(@Ctx() ctx: RequestContext, @ZodParam('itemId', z.uuid()) itemId: string) {
    await this.catalog.archiveItem(ctx.tenant.id, itemId, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
    return { ok: true };
  }
}

@ApiTags('catalog')
@Controller('item-categories')
export class ItemCategoriesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermission('catalog.item.read')
  list(@Ctx() ctx: RequestContext) {
    return this.catalog.listCategories(ctx.tenant.id);
  }

  @Post()
  @RequirePermission('catalog.category.manage')
  create(
    @Ctx() ctx: RequestContext,
    @ZodBody(createItemCategoryRequestSchema) body: z.infer<typeof createItemCategoryRequestSchema>,
  ) {
    return this.catalog.createCategory(ctx.tenant.id, body, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
  }
}

@ApiTags('catalog')
@Controller('uoms')
export class UomsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermission('catalog.item.read')
  list(@Ctx() ctx: RequestContext) {
    return this.catalog.listUoms(ctx.tenant.id);
  }
}

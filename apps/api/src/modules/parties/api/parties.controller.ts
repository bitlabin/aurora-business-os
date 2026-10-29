import { Controller, Delete, Get, Headers, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AppError,
  addPartyRoleRequestSchema,
  createPartyRequestSchema,
  partyListQuerySchema,
  updatePartyRequestSchema,
} from '@aurora/types';
import { z } from 'zod';
import {
  Ctx,
  RequirePermission,
  type RequestContext,
} from '../../../platform/auth/request-context';
import { ZodBody, ZodParam, ZodQuery } from '../../../platform/http/zod';
import { PartyService } from '../application/party.service';

function parseIfMatch(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const m = /^"?(?:version-)?(\d+)"?$/.exec(value.trim());
  if (!m)
    throw AppError.validation([
      { path: 'If-Match', message: 'Expected a record version, e.g. "version-3"' },
    ]);
  return Number(m[1]);
}

@ApiTags('crm')
@Controller('parties')
export class PartiesController {
  constructor(private readonly parties: PartyService) {}

  @Get()
  @RequirePermission('crm.party.read')
  list(
    @Ctx() ctx: RequestContext,
    @ZodQuery(partyListQuerySchema) query: z.infer<typeof partyListQuerySchema>,
  ) {
    return this.parties.list(ctx.tenant.id, query);
  }

  @Get(':partyId')
  @RequirePermission('crm.party.read')
  async get(@Ctx() ctx: RequestContext, @ZodParam('partyId', z.uuid()) partyId: string) {
    const party = await this.parties.get(ctx.tenant.id, partyId);
    if (!party) throw AppError.notFound('Party');
    return party;
  }

  @Post()
  @RequirePermission('crm.party.create')
  create(
    @Ctx() ctx: RequestContext,
    @ZodBody(createPartyRequestSchema) body: z.infer<typeof createPartyRequestSchema>,
  ) {
    return this.parties.create(ctx.tenant.id, body, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
  }

  @Patch(':partyId')
  @RequirePermission('crm.party.update')
  update(
    @Ctx() ctx: RequestContext,
    @ZodParam('partyId', z.uuid()) partyId: string,
    @ZodBody(updatePartyRequestSchema) body: z.infer<typeof updatePartyRequestSchema>,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.parties.update(ctx.tenant.id, partyId, body, parseIfMatch(ifMatch), {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
  }

  @Post(':partyId/roles')
  @HttpCode(200)
  @RequirePermission('crm.party.update')
  addRole(
    @Ctx() ctx: RequestContext,
    @ZodParam('partyId', z.uuid()) partyId: string,
    @ZodBody(addPartyRoleRequestSchema) body: z.infer<typeof addPartyRoleRequestSchema>,
  ) {
    return this.parties.addRole(ctx.tenant.id, partyId, body.role, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
  }

  @Delete(':partyId')
  @RequirePermission('crm.party.archive')
  async archive(@Ctx() ctx: RequestContext, @ZodParam('partyId', z.uuid()) partyId: string) {
    await this.parties.archive(ctx.tenant.id, partyId, {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
    return { ok: true };
  }
}

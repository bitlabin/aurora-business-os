import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { UnitOfWork } from '../../../platform/database/unit-of-work';
import {
  CompanyScoped,
  Ctx,
  RequirePermission,
  type RequestContext,
} from '../../../platform/auth/request-context';
import { ZodQuery } from '../../../platform/http/zod';
import { auditEvents } from '../infrastructure/schema';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.coerce.number().int().optional(),
  subjectType: z.string().max(64).optional(),
  subjectId: z.string().max(128).optional(),
});

@ApiTags('admin')
@Controller('admin/audit-events')
@CompanyScoped(false)
export class AuditController {
  constructor(private readonly uow: UnitOfWork) {}

  @Get()
  @RequirePermission('admin.audit.read')
  async list(
    @Ctx() ctx: RequestContext,
    @ZodQuery(querySchema) query: z.infer<typeof querySchema>,
  ) {
    return this.uow.run(
      { tenantId: ctx.tenant.id, userId: ctx.user.id, requestId: ctx.requestId },
      async (db) => {
        const conditions = [eq(auditEvents.tenantId, ctx.tenant.id)];
        if (query.cursor !== undefined) conditions.push(lt(auditEvents.seq, query.cursor));
        if (query.subjectType) conditions.push(eq(auditEvents.subjectType, query.subjectType));
        if (query.subjectId) conditions.push(eq(auditEvents.subjectId, query.subjectId));
        const rows = await db
          .select()
          .from(auditEvents)
          .where(and(...conditions))
          .orderBy(desc(auditEvents.seq))
          .limit(query.limit + 1);
        const page = rows.slice(0, query.limit);
        const last = page[page.length - 1];
        return {
          items: page,
          nextCursor: rows.length > query.limit && last ? String(last.seq) : null,
        };
      },
    );
  }
}

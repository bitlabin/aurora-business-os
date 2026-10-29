import { Injectable } from '@nestjs/common';
import type { RequestContext } from '../../platform/auth/request-context';
import type { SecurityEventSink } from '../../platform/auth/security-events';
import { UnitOfWork } from '../../platform/database/unit-of-work';
import { AuditService } from '../../modules/audit';

/** Records denied attempts in the tenant's audit log, in their own transaction so the denial persists even though the request fails. */
@Injectable()
export class AuditSecurityEventSink implements SecurityEventSink {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async denied(
    ctx: RequestContext,
    event: { action: string; resource: string; reason: string },
  ): Promise<void> {
    await this.uow.run(
      { tenantId: ctx.tenant.id, userId: ctx.user.id, requestId: ctx.requestId },
      () =>
        this.audit.record({
          tenantId: ctx.tenant.id,
          companyId: ctx.companyId,
          actorUserId: ctx.user.id,
          action: event.action,
          subjectType: 'route',
          subjectId: event.resource,
          reason: event.reason,
          requestId: ctx.requestId,
          ip: ctx.client.ip,
          userAgent: ctx.client.userAgent,
          sensitive: true,
        }),
    );
  }
}

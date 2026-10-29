import { Injectable } from '@nestjs/common';
import { AppError, type LocalizedText, newId } from '@aurora/types';
import { and, eq } from 'drizzle-orm';
import { UnitOfWork } from '../../../platform/database/unit-of-work';
import { AuditService } from '../../audit';
import { warehouses } from '../infrastructure/schema';

interface Actor {
  userId?: string | undefined;
  requestId?: string | undefined;
}

/** Warehouse master only (Phase 0). The stock ledger is Phase 2. */
@Injectable()
export class WarehouseService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, companyId: string) {
    return this.uow.run({ tenantId }, (db) =>
      db.query.warehouses.findMany({
        where: and(eq(warehouses.tenantId, tenantId), eq(warehouses.companyId, companyId)),
        orderBy: warehouses.code,
      }),
    );
  }

  async create(
    tenantId: string,
    companyId: string,
    input: { code: string; name: LocalizedText },
    actor: Actor,
  ) {
    const id = newId();
    return this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const dup = await db.query.warehouses.findFirst({
          where: and(
            eq(warehouses.tenantId, tenantId),
            eq(warehouses.companyId, companyId),
            eq(warehouses.code, input.code),
          ),
        });
        if (dup)
          throw AppError.conflict(`Warehouse "${input.code}" already exists in this company`);
        const [row] = await db
          .insert(warehouses)
          .values({
            id,
            tenantId,
            companyId,
            code: input.code,
            name: input.name,
            createdBy: actor.userId ?? null,
          })
          .returning();
        if (!row) throw new Error('insert returned no row');
        await this.audit.record({
          tenantId,
          companyId,
          actorUserId: actor.userId,
          action: 'warehouse.created',
          subjectType: 'warehouse',
          subjectId: id,
          after: { code: input.code },
        });
        return row;
      },
    );
  }
}

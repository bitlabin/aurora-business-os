import { Injectable } from '@nestjs/common';
import { newId, type OutboxEventId } from '@aurora/types';
import { UnitOfWork } from '../database/unit-of-work';
import { outboxEvents } from './schema';

export interface DomainEvent {
  tenantId: string;
  companyId?: string | undefined;
  domain: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  payload: Record<string, unknown>;
  /** Defaults to `${type}:${aggregateId}:${aggregateVersion}` — stable across retries. */
  idempotencyKey?: string;
  causationId?: string | undefined;
  actorUserId?: string | undefined;
  schemaVersion?: number;
}

/**
 * Transactional outbox writer (FDD §3.3). The event row commits with the state change;
 * apps/worker relays it. Phase 0 has no consumers yet, but every state change already emits so
 * Phase 1 integrations start from a complete history.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly uow: UnitOfWork) {}

  async publish(event: DomainEvent): Promise<OutboxEventId> {
    const id = newId<OutboxEventId>();
    await this.uow.db.insert(outboxEvents).values({
      id,
      tenantId: event.tenantId,
      companyId: event.companyId ?? null,
      domain: event.domain,
      type: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion,
      schemaVersion: event.schemaVersion ?? 1,
      idempotencyKey:
        event.idempotencyKey ?? `${event.type}:${event.aggregateId}:${event.aggregateVersion}`,
      causationId: event.causationId ?? null,
      correlationId: this.uow.context.requestId ?? null,
      actorUserId: event.actorUserId ?? null,
      payload: event.payload,
    });
    return id;
  }
}

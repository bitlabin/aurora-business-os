import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenantColumn } from '../database/columns';

/**
 * Transactional outbox (FDD §3.3, F-DATA-002). Written inside the same transaction as the
 * state change it describes; relayed by apps/worker; consumers deduplicate in
 * `processed_events` on (tenant, consumer, event_id).
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey(),
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    tenantId: tenantColumn(),
    companyId: uuid('company_id'),
    domain: text('domain').notNull(),
    type: text('type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    aggregateVersion: integer('aggregate_version').notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    idempotencyKey: text('idempotency_key').notNull(),
    causationId: uuid('causation_id'),
    correlationId: text('correlation_id'),
    actorUserId: uuid('actor_user_id'),
    effectiveAt: timestamp('effective_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [
    index('outbox_events_unpublished_idx').on(t.publishedAt, t.seq),
    index('outbox_events_tenant_idx').on(t.tenantId, t.seq),
  ],
);

export const processedEvents = pgTable(
  'processed_events',
  {
    tenantId: tenantColumn(),
    consumer: text('consumer').notNull(),
    eventId: uuid('event_id').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.consumer, t.eventId] })],
);

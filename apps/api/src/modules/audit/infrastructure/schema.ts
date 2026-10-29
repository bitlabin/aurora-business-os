import {
  bigserial,
  boolean,
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenantColumn } from '../../../platform/database/columns';

/**
 * Append-only audit log (FDD SEC-005, FA-004). The application role has INSERT and SELECT
 * only — no UPDATE/DELETE grant — and a trigger rejects modification as a second line of
 * defence. `before`/`after` carry redacted diffs; secrets never reach this table.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey(),
    /** Monotonic ordering independent of clock skew. */
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    tenantId: tenantColumn(),
    companyId: uuid('company_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    actorUserId: uuid('actor_user_id'),
    actorType: text('actor_type', { enum: ['user', 'system', 'job', 'connector'] }).notNull(),
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    before: jsonb('before').$type<Record<string, unknown> | null>(),
    after: jsonb('after').$type<Record<string, unknown> | null>(),
    reason: text('reason'),
    approvalId: uuid('approval_id'),
    requestId: text('request_id'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    sensitive: boolean('sensitive').notNull().default(false),
  },
  (t) => [
    index('audit_events_tenant_seq_idx').on(t.tenantId, t.seq),
    index('audit_events_subject_idx').on(t.tenantId, t.subjectType, t.subjectId),
    index('audit_events_actor_idx').on(t.tenantId, t.actorUserId),
  ],
);

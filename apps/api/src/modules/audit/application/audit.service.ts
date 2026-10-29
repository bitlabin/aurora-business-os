import { Injectable } from '@nestjs/common';
import { type AuditEventId, newId } from '@aurora/types';
import { UnitOfWork } from '../../../platform/database/unit-of-work';
import { auditEvents } from '../infrastructure/schema';

export interface AuditEntry {
  tenantId: string;
  companyId?: string | undefined;
  actorUserId?: string | undefined;
  actorType?: 'user' | 'system' | 'job' | 'connector';
  action: string;
  subjectType: string;
  subjectId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | undefined;
  approvalId?: string | undefined;
  requestId?: string | undefined;
  ip?: string | undefined;
  userAgent?: string | undefined;
  sensitive?: boolean;
}

const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'tokenHash',
  'secret',
  'apiKey',
]);

/** Strip anything that looks like a credential before it reaches the audit log (SEC-005). */
export function redact(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACTED_KEYS.has(k) ? '[REDACTED]' : v;
  }
  return out;
}

/**
 * Writes append-only audit events inside the caller's transaction, so an audit row exists if
 * and only if the audited change committed.
 */
@Injectable()
export class AuditService {
  constructor(private readonly uow: UnitOfWork) {}

  async record(entry: AuditEntry): Promise<AuditEventId> {
    const id = newId<AuditEventId>();
    await this.uow.db.insert(auditEvents).values({
      id,
      tenantId: entry.tenantId,
      companyId: entry.companyId ?? null,
      actorUserId: entry.actorUserId ?? null,
      actorType: entry.actorType ?? (entry.actorUserId ? 'user' : 'system'),
      action: entry.action,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      before: redact(entry.before),
      after: redact(entry.after),
      reason: entry.reason ?? null,
      approvalId: entry.approvalId ?? null,
      requestId: entry.requestId ?? this.uow.context.requestId ?? null,
      ipAddress: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      sensitive: entry.sensitive ?? false,
    });
    return id;
  }
}

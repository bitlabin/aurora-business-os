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

/** Key fragments (case-insensitive) that mark a value as a credential. */
const SENSITIVE_KEY =
  /password|passwd|secret|token|api[_-]?key|private[_-]?key|credential|authorization|mfa/i;

/**
 * Strip anything that looks like a credential before it reaches the audit log (SEC-005).
 * Recurses into nested objects and arrays; matching is case-insensitive on key fragments so
 * `currentPassword`, `sessionToken` and `mfaSecret` are caught, not only exact names.
 */
export function redact(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  return redactValue(value, 0) as Record<string, unknown>;
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
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

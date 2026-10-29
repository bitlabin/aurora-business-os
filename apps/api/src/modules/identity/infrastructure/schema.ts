import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditColumns, idColumn } from '../../../platform/database/columns';

/**
 * Identity tables are platform-level (not tenant-owned): a user may belong to several tenants
 * through memberships, and a session must be resolvable before the tenant is known (ADR-003).
 * They are therefore NOT under RLS; access to them is limited to the identity module.
 */
export const users = pgTable(
  'users',
  {
    id: idColumn(),
    email: text('email').notNull(),
    /** Lower-cased copy for case-insensitive uniqueness and lookup. */
    emailNormalized: text('email_normalized').notNull().unique(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    locale: text('locale').notNull().default('en'),
    status: text('status', { enum: ['active', 'suspended'] })
      .notNull()
      .default('active'),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true, mode: 'string' }),
    mfaEnrolledAt: timestamp('mfa_enrolled_at', { withTimezone: true, mode: 'string' }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'string' }),
    ...auditColumns(),
  },
  (t) => [index('users_status_idx').on(t.status)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: idColumn(),
    /** HMAC-SHA256 of the opaque token; the raw token is never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    /** Sliding expiry, extended on use up to `absoluteExpiresAt`. */
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    revokedReason: text('revoked_reason'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    mfaVerified: boolean('mfa_verified').notNull().default(false),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expiry_idx').on(t.expiresAt)],
);

import { Inject, Injectable } from '@nestjs/common';
import { AppError, type SessionId, type UserId, newId } from '@aurora/types';
import { and, eq, isNull } from 'drizzle-orm';
import { ENV, type Env } from '../../../platform/config/env';
import { UnitOfWork } from '../../../platform/database/unit-of-work';
import { isLocked, recordFailure, recordSuccess } from '../domain/lockout';
import { PasswordHasher } from '../infrastructure/password-hasher';
import { sessions, users } from '../infrastructure/schema';
import { SessionTokenService } from '../infrastructure/session-token';

export interface UserRecord {
  id: UserId;
  email: string;
  displayName: string;
  locale: 'en' | 'ar';
  status: 'active' | 'suspended';
}

export interface ResolvedSession {
  sessionId: SessionId;
  tenantId: string;
  user: UserRecord;
  expiresAt: string;
}

export interface ClientInfo {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * First-party identity (ADR-003): users, credentials, sessions. Tenant membership is the
 * tenancy module's concern; this service only answers "who is this?" and "is this session valid?".
 */
@Injectable()
export class IdentityService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
    private readonly tokens: SessionTokenService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async createUser(input: {
    email: string;
    password: string;
    displayName: string;
    locale?: 'en' | 'ar';
  }): Promise<UserRecord> {
    const passwordHash = await this.hasher.hash(input.password);
    const id = newId<UserId>();
    return this.uow.run({}, async (db) => {
      const existing = await db.query.users.findFirst({
        where: eq(users.emailNormalized, normalizeEmail(input.email)),
      });
      if (existing) throw AppError.conflict('A user with this email already exists');
      const [row] = await db
        .insert(users)
        .values({
          id,
          email: input.email.trim(),
          emailNormalized: normalizeEmail(input.email),
          displayName: input.displayName,
          passwordHash,
          locale: input.locale ?? 'en',
        })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return toUser(row);
    });
  }

  /**
   * Verify credentials with lockout and constant-time behaviour. Returns the user without
   * creating a session — the caller decides which tenant the session is for.
   */
  async authenticate(email: string, password: string): Promise<UserRecord> {
    const policy = {
      maxFailedAttempts: this.env.LOGIN_MAX_FAILED_ATTEMPTS,
      lockoutMinutes: this.env.LOGIN_LOCKOUT_MINUTES,
    };
    const now = new Date();
    const user = await this.uow.run({}, (db) =>
      db.query.users.findFirst({ where: eq(users.emailNormalized, normalizeEmail(email)) }),
    );
    // Always run a hash verification so timing does not reveal whether the email exists.
    const ok = await this.hasher.verify(user?.passwordHash ?? DUMMY_HASH, password);

    if (user?.status !== 'active') throw invalidCredentials();

    const state = {
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil ? new Date(user.lockedUntil) : null,
    };
    if (isLocked(state, now)) {
      throw new AppError(
        'RATE_LIMITED',
        'Account temporarily locked after repeated failed sign-in attempts',
        { retryable: true },
      );
    }

    if (!ok) {
      // Recorded in its own transaction: the counter must persist even though the login fails.
      const next = recordFailure(state, policy, now);
      await this.uow.run({}, (db) =>
        db
          .update(users)
          .set({
            failedLoginAttempts: next.failedLoginAttempts,
            lockedUntil: next.lockedUntil?.toISOString() ?? null,
          })
          .where(eq(users.id, user.id)),
      );
      throw invalidCredentials();
    }

    const cleared = recordSuccess();
    await this.uow.run({}, (db) =>
      db
        .update(users)
        .set({
          failedLoginAttempts: cleared.failedLoginAttempts,
          lockedUntil: null,
          lastLoginAt: now.toISOString(),
        })
        .where(eq(users.id, user.id)),
    );
    return toUser(user);
  }

  async createSession(input: {
    userId: UserId;
    tenantId: string;
    client: ClientInfo;
  }): Promise<{ token: string; expiresAt: string }> {
    const token = this.tokens.generate();
    const now = Date.now();
    const expiresAt = new Date(now + this.env.SESSION_TTL_MINUTES * 60_000).toISOString();
    const absoluteExpiresAt = new Date(
      now + this.env.SESSION_ABSOLUTE_TTL_HOURS * 3_600_000,
    ).toISOString();
    await this.uow.run({}, async (db) => {
      await db.insert(sessions).values({
        id: newId<SessionId>(),
        tokenHash: this.tokens.hash(token),
        userId: input.userId,
        tenantId: input.tenantId,
        expiresAt,
        absoluteExpiresAt,
        ipAddress: input.client.ip ?? null,
        userAgent: input.client.userAgent ?? null,
      });
    });
    return { token, expiresAt };
  }

  /** Validate a token, slide its expiry, and return the owning user. Null when invalid. */
  async resolveSession(token: string): Promise<ResolvedSession | null> {
    const tokenHash = this.tokens.hash(token);
    const now = new Date();
    return this.uow.run({}, async (db) => {
      const row = await db.query.sessions.findFirst({
        where: and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)),
      });
      if (!row) return null;
      if (new Date(row.expiresAt) <= now || new Date(row.absoluteExpiresAt) <= now) return null;

      const user = await db.query.users.findFirst({ where: eq(users.id, row.userId) });
      if (user?.status !== 'active') return null;

      const slid = new Date(
        Math.min(
          now.getTime() + this.env.SESSION_TTL_MINUTES * 60_000,
          new Date(row.absoluteExpiresAt).getTime(),
        ),
      );
      // Only write when the expiry moves by more than a minute, to keep reads cheap.
      if (slid.getTime() - new Date(row.expiresAt).getTime() > 60_000) {
        await db
          .update(sessions)
          .set({ expiresAt: slid.toISOString(), lastSeenAt: now.toISOString() })
          .where(eq(sessions.id, row.id));
      }
      return {
        sessionId: row.id as SessionId,
        tenantId: row.tenantId,
        user: toUser(user),
        expiresAt: slid.toISOString(),
      };
    });
  }

  async revokeSession(sessionId: string, reason: string): Promise<void> {
    await this.uow.run({}, async (db) => {
      await db
        .update(sessions)
        .set({ revokedAt: new Date().toISOString(), revokedReason: reason })
        .where(eq(sessions.id, sessionId));
    });
  }

  async revokeAllSessions(userId: string, reason: string): Promise<number> {
    return this.uow.run({}, async (db) => {
      const rows = await db
        .update(sessions)
        .set({ revokedAt: new Date().toISOString(), revokedReason: reason })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id });
      return rows.length;
    });
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.uow.run({}, async (db) => {
      const row = await db.query.users.findFirst({
        where: eq(users.emailNormalized, normalizeEmail(email)),
      });
      return row ? toUser(row) : null;
    });
  }
}

function invalidCredentials(): AppError {
  return AppError.unauthenticated('Invalid email or password');
}

function toUser(row: typeof users.$inferSelect): UserRecord {
  return {
    id: row.id as UserId,
    email: row.email,
    displayName: row.displayName,
    locale: row.locale === 'ar' ? 'ar' : 'en',
    status: row.status,
  };
}

/** A valid argon2id hash of a random string; used so missing users cost the same time as real ones. */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXlzYWx0$9wQ3Zb6Y4yC0f7o5XxWJ2qPaC5n2vY0C1rXkX1m3P7w';

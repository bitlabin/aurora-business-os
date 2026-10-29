import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService, type Db } from './database.service';

/** Transaction-scoped context propagated to PostgreSQL as SET LOCAL settings. */
export interface TxContext {
  tenantId?: string | undefined;
  userId?: string | undefined;
  requestId?: string | undefined;
}

interface ActiveTx {
  db: Db;
  context: TxContext;
  depth: number;
}

/**
 * One transaction per command (ADR-002). `run` opens a transaction, applies the tenant context
 * as transaction-local settings that the RLS policies read, executes the callback, and commits.
 * Nested `run` calls join the outer transaction. Repositories read the active handle through
 * `db` and therefore can never run outside a tenant-scoped transaction.
 */
@Injectable()
export class UnitOfWork {
  private readonly storage = new AsyncLocalStorage<ActiveTx>();

  constructor(private readonly database: DatabaseService) {}

  /** Active transaction handle; throws if called outside `run`. */
  get db(): Db {
    const active = this.storage.getStore();
    if (!active) {
      throw new Error('No active transaction: database access must happen inside UnitOfWork.run()');
    }
    return active.db;
  }

  get context(): TxContext {
    return this.storage.getStore()?.context ?? {};
  }

  isActive(): boolean {
    return this.storage.getStore() !== undefined;
  }

  async run<T>(context: TxContext, fn: (db: Db) => Promise<T>): Promise<T> {
    const existing = this.storage.getStore();
    if (existing) {
      this.assertCompatible(existing.context, context);
      return this.storage.run({ ...existing, depth: existing.depth + 1 }, () => fn(existing.db));
    }

    const client = await this.database.connect();
    const db = this.database.bind(client);
    try {
      await client.query('BEGIN');
      // Parameterised SET LOCAL is not supported; set_config is, and is transaction-local with is_local=true.
      await db.execute(sql`SELECT set_config('app.tenant_id', ${context.tenantId ?? ''}, true)`);
      await db.execute(sql`SELECT set_config('app.user_id', ${context.userId ?? ''}, true)`);
      await db.execute(sql`SELECT set_config('app.request_id', ${context.requestId ?? ''}, true)`);
      const result = await this.storage.run({ db, context, depth: 0 }, () => fn(db));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // connection is unusable; release(true) discards it below
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private assertCompatible(outer: TxContext, inner: TxContext): void {
    if (
      inner.tenantId !== undefined &&
      outer.tenantId !== undefined &&
      inner.tenantId !== outer.tenantId
    ) {
      throw new Error(
        `Nested transaction for tenant ${inner.tenantId} inside transaction for tenant ${outer.tenantId}`,
      );
    }
  }
}

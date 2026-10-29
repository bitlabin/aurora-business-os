import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { ENV, type Env } from '../config/env';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

/**
 * Owns the application-role connection pool (RLS enforced). Nothing outside the UnitOfWork
 * should check out clients directly; this keeps every query inside a transaction that carries
 * the tenant context (ADR-001).
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: Pool;

  constructor(@Inject(ENV) env: Env) {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      // Decimal strings from NUMERIC columns are kept as strings by node-postgres by default;
      // we never register a parser that would turn them into floats.
    });
    this.pool.on('error', (err) => {
      this.logger.error(`pool error: ${err.message}`);
    });
  }

  async connect(): Promise<PoolClient> {
    return this.pool.connect();
  }

  bind(client: PoolClient): Db {
    return drizzle(client, { schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

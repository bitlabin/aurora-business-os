/**
 * Runs pending SQL migrations as the admin/owner role. Used by `pnpm db:migrate`, CI and tests.
 * Never run with the application role: it must not own the schema (ADR-001).
 */
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export async function runMigrations(adminUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: join(__dirname, '..', '..', '..', 'drizzle') });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    console.error('DATABASE_ADMIN_URL is required');
    process.exit(1);
  }
  runMigrations(url)
    .then(() => {
      console.warn('migrations applied');
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}

import { Pool } from 'pg';
import { runMigrations } from '../../src/platform/database/migrate';

/**
 * Runs once per `vitest` invocation: migrate as admin, then empty every table so each run starts
 * from a known state. Specs create their own tenants (with unique suffixes) and never assume
 * other specs' data.
 */
export default async function globalSetup(): Promise<void> {
  const adminUrl =
    process.env.DATABASE_ADMIN_URL ??
    'postgres://aurora_admin:aurora_admin_dev@127.0.0.1:5432/aurora';
  await runMigrations(adminUrl);
  const pool = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '__drizzle%'`,
    );
    const names = rows.map((r) => `"${r.tablename}"`).join(', ');
    if (names.length > 0) await pool.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
  } finally {
    await pool.end();
  }
}

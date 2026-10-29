/**
 * Static RLS lint (ADR-001). Fails when:
 *  - a Drizzle table has a tenant_id column but is not listed in drizzle/rls-tables.json, or
 *  - a listed table is never mentioned in a migration that enables row level security.
 * The live counterpart (test/e2e/parties-and-access.e2e-spec.ts (live RLS audit)) checks pg_class.relrowsecurity/relforcerowsecurity.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../apps/api/src/platform/database/schema';

const apiDir = join(__dirname, '..', 'apps', 'api');
const manifest = JSON.parse(readFileSync(join(apiDir, 'drizzle', 'rls-tables.json'), 'utf8')) as {
  tables: string[];
  platformTables: string[];
};

const problems: string[] = [];
const listed = new Set(manifest.tables);
const platform = new Set(manifest.platformTables);

for (const value of Object.values(schema)) {
  if (typeof value !== 'object' || value === null) continue;
  let config: ReturnType<typeof getTableConfig>;
  try {
    config = getTableConfig(value as Parameters<typeof getTableConfig>[0]);
  } catch {
    continue;
  }
  const hasTenant = config.columns.some((c) => c.name === 'tenant_id');
  if (hasTenant && !listed.has(config.name) && !platform.has(config.name)) {
    problems.push(`table "${config.name}" has tenant_id but is not in drizzle/rls-tables.json`);
  }
  if (!hasTenant && listed.has(config.name)) {
    problems.push(`table "${config.name}" is listed for RLS but has no tenant_id column`);
  }
}

const migrations = readdirSync(join(apiDir, 'drizzle'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(apiDir, 'drizzle', f), 'utf8'))
  .filter((sql) => /ROW LEVEL SECURITY/i.test(sql))
  .join('\n');

for (const table of manifest.tables) {
  if (!new RegExp(`'${table}'`).test(migrations)) {
    problems.push(
      `table "${table}" is listed in rls-tables.json but no migration enables RLS for it`,
    );
  }
}

if (problems.length > 0) {
  console.error('RLS lint failed:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`RLS lint passed: ${manifest.tables.length} tenant-owned tables covered.`);

import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit is used to *generate* migration SQL from the schema. Generated files are then
 * hand-edited to add RLS policies, triggers and composite constraints before being committed
 * (ADR-002). `db push` is intentionally not available as a script.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/platform/database/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.DATABASE_ADMIN_URL ??
      'postgres://aurora_admin:aurora_admin_dev@127.0.0.1:5432/aurora',
  },
  strict: true,
  verbose: true,
});

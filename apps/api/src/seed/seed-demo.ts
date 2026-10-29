import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app/app.module';
import { loadEnv } from '../platform/config/env';
import { TenancyService } from '../modules/tenancy';
import { DEMO_PASSWORD, DEMO_TENANT_SLUGS, seedDemo } from './demo-dataset';

/**
 * `pnpm db:seed` — provisions the DEMO dataset. Idempotent at the tenant level: when the demo
 * tenants already exist it reports and exits 0, so a container entrypoint can run it on every
 * start. It never partially re-seeds; drop the database to start over.
 */
async function main(): Promise<void> {
  loadEnv();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const tenancy = app.get(TenancyService);
    const existing = await tenancy.findTenantBySlug(DEMO_TENANT_SLUGS.northwind);
    if (existing) {
      console.warn(`DEMO data already present (tenant ${existing.slug}); nothing to do.`);
      return;
    }
    const data = await seedDemo(app);
    console.warn('DEMO data seeded.');
    console.warn(
      `  Tenant ${data.northwind.slug}: companies ${Object.keys(data.northwind.companies).join(', ')}; users ${Object.values(
        data.northwind.users,
      )
        .map((u) => u.email)
        .join(', ')}`,
    );
    console.warn(
      `  Tenant ${data.harbor.slug}: companies ${Object.keys(data.harbor.companies).join(', ')}; users ${Object.values(
        data.harbor.users,
      )
        .map((u) => u.email)
        .join(', ')}`,
    );
    console.warn(`  Password for every demo user: ${DEMO_PASSWORD}`);
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

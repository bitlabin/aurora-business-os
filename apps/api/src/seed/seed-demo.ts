import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app/app.module';
import { loadEnv } from '../platform/config/env';
import { DEMO_PASSWORD, seedDemo } from './demo-dataset';

/** `pnpm db:seed` — provisions the DEMO dataset. Safe to run once per database; re-running fails on duplicate slugs. */
async function main(): Promise<void> {
  loadEnv();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
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

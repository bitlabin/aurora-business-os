import 'reflect-metadata';
import { createApp } from './app/bootstrap';
import { loadEnv } from './platform/config/env';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await createApp();
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  // eslint-disable-next-line no-console
  console.log(
    `Aurora API listening on http://${env.API_HOST}:${env.API_PORT}/api/v1 (docs at /api/v1/docs)`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { env } from '../platform/config/env';
import { AppModule } from './app.module';

export const API_PREFIX = 'api/v1';

/** Creates a fully configured application instance; shared by main.ts and the e2e tests. */
export async function createApp(
  options: { logger?: boolean; openApi?: boolean } = {},
): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    trustProxy: true,
    // Request ids are honoured from a trusted proxy header or generated; echoed in every error body.
    genReqId: (req: IncomingMessage) =>
      typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : randomUUID(),
    requestIdHeader: 'x-request-id',
    bodyLimit: 1_048_576,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
    ...(options.logger === false ? { logger: false } : {}),
  });
  if (options.logger !== false) app.useLogger(app.get(Logger));

  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin: env()
      .CORS_ORIGINS.split(',')
      .map((o) => o.trim()),
    credentials: true,
  });
  await app.register(fastifyCookie, { secret: env().SESSION_SECRET });
  await app.register(fastifyHelmet, { contentSecurityPolicy: false });
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', async (_req, reply) => {
      void reply.header('x-request-id', _req.id);
    });

  if (options.openApi !== false) setupOpenApi(app);
  app.enableShutdownHooks();
  return app;
}

export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Aurora Business OS API')
    .setDescription('Multi-industry CRM + ERP + accounting platform. Phase 0: platform foundation.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Company-Id' }, 'company')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document, {
    jsonDocumentUrl: `${API_PREFIX}/openapi.json`,
  });
}

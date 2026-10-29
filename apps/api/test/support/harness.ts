import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../../src/app/bootstrap';
import { loadEnv } from '../../src/platform/config/env';
import { DEMO_PASSWORD, type DemoDataset, seedDemo } from '../../src/seed/demo-dataset';

export { DEMO_PASSWORD };

export interface TestApp {
  app: NestFastifyApplication;
  data: DemoDataset;
  /** Admin (superuser) pool for assertions that must bypass RLS, e.g. row counts. */
  admin: Pool;
  close(): Promise<void>;
}

/** Boots the real application (no mocks) and seeds a fresh copy of the DEMO dataset with a unique suffix. */
export async function createTestApp(): Promise<TestApp> {
  loadEnv();
  const app = await createApp({ logger: false, openApi: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const data = await seedDemo(app, `-${randomUUID().slice(0, 8)}`);
  const admin = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL, max: 2 });
  return {
    app,
    data,
    admin,
    close: async () => {
      await admin.end();
      await app.close();
    },
  };
}

export interface ApiClient {
  token: string;
  companyId: string | undefined;
  as(companyId: string | undefined): ApiClient;
  get(path: string): Promise<Response>;
  post(path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
  patch(path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
  delete(path: string, body?: unknown): Promise<Response>;
}

export interface Response {
  status: number;
  body: any;
  headers: Record<string, string | string[] | undefined>;
}

export async function login(
  app: NestFastifyApplication,
  email: string,
  tenantSlug: string,
  password = DEMO_PASSWORD,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password, tenantSlug },
  });
  if (res.statusCode !== 200) throw new Error(`login failed (${res.statusCode}): ${res.body}`);
  const body = res.json<{ status: string; token: string }>();
  if (body.status !== 'ok') throw new Error(`unexpected login response: ${res.body}`);
  return body.token;
}

export function client(app: NestFastifyApplication, token: string, companyId?: string): ApiClient {
  const call = async (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    extra: Record<string, string> = {},
  ): Promise<Response> => {
    const res = await app.inject({
      method,
      url: `/api/v1${path}`,
      headers: {
        authorization: `Bearer ${token}`,
        ...(companyId ? { 'x-company-id': companyId } : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
    });
    let parsed: unknown = res.body;
    try {
      parsed = res.body.length > 0 ? JSON.parse(res.body) : undefined;
    } catch {
      /* non-JSON body */
    }
    return {
      status: res.statusCode,
      body: parsed,
      headers: res.headers as Record<string, string | string[] | undefined>,
    };
  };
  return {
    token,
    companyId,
    as: (c) => client(app, token, c),
    get: (p) => call('GET', p),
    post: (p, b, h) => call('POST', p, b, h),
    patch: (p, b, h) => call('PATCH', p, b, h),
    delete: (p, b) => call('DELETE', p, b),
  };
}

/** Convenience: login as a demo user and return a client bound to a company. */
export async function as(
  t: TestApp,
  tenant: 'northwind' | 'harbor',
  user: string,
  company?: string,
): Promise<ApiClient> {
  const tenantData = t.data[tenant];
  const u = tenantData.users[user];
  if (!u) throw new Error(`unknown demo user ${user}`);
  const token = await login(t.app, u.email, tenantData.slug);
  return client(t.app, token, company ? tenantData.companies[company] : undefined);
}

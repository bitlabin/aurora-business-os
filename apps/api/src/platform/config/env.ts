import { z } from 'zod';

/**
 * Environment is validated once at startup. A missing or malformed variable fails fast with a
 * readable message instead of surfacing as an undefined deep inside a request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  /** Application role connection: RLS is enforced, cannot bypass tenant policies. */
  DATABASE_URL: z.url(),
  /** Migration/admin connection. Not used by the HTTP process except for `db:migrate` and tests. */
  DATABASE_ADMIN_URL: z.url().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: z.url().optional(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_TTL_MINUTES: z.coerce.number().int().min(5).default(720),
  SESSION_ABSOLUTE_TTL_HOURS: z.coerce.number().int().min(1).default(168),
  /**
   * `Secure` attribute on the session cookie. Defaults to on in production. Set to `false` only
   * for a local evaluation stack served over plain http (docker-compose.demo.yml); never behind
   * a real hostname.
   */
  SESSION_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return parsed.data;
}

export function env(): Env {
  return cached ?? loadEnv();
}

export const ENV = Symbol('ENV');

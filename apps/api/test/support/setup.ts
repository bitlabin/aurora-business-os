/**
 * Per-worker environment for e2e specs. Values can be overridden by the environment (CI sets
 * them explicitly); defaults match scripts/pg-local.sh and infra/docker.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://aurora_app:aurora_app_dev@127.0.0.1:5432/aurora';
process.env.DATABASE_ADMIN_URL ??= 'postgres://aurora_admin:aurora_admin_dev@127.0.0.1:5432/aurora';
process.env.SESSION_SECRET ??= 'test-only-session-secret-test-only-session-secret';
process.env.LOG_LEVEL ??= 'silent';
process.env.LOGIN_MAX_FAILED_ATTEMPTS ??= '3';
process.env.LOGIN_LOCKOUT_MINUTES ??= '1';

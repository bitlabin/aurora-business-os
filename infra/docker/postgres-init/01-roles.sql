-- Two roles, by design (ADR-001):
--   aurora_admin  : owns schema, runs migrations (created by the image from POSTGRES_USER)
--   aurora_app    : the application role; does NOT own tables, so RLS is always enforced.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aurora_app') THEN
    CREATE ROLE aurora_app LOGIN PASSWORD 'aurora_app_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;
GRANT CONNECT ON DATABASE aurora TO aurora_app;

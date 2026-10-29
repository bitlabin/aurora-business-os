-- ---------------------------------------------------------------------------------------------
-- 0001_security_policies — hand-written (ADR-001, ADR-003, SEC-004, SEC-005)
--
-- 1. Row-level security on every tenant-owned table, keyed on the per-transaction setting
--    app.tenant_id that the application sets with SET LOCAL from the server-resolved session.
-- 2. Least-privilege grants for the application role aurora_app, which does not own tables and
--    therefore cannot bypass RLS. Append-only tables get no UPDATE/DELETE grant.
-- 3. Database-level invariants Drizzle cannot express: append-only triggers, physical-profile
--    kind guard, optimistic version bump.
-- ---------------------------------------------------------------------------------------------

-- Application role (idempotent; also created by infra/docker/postgres-init for fresh clusters)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aurora_app') THEN
    CREATE ROLE aurora_app LOGIN PASSWORD 'aurora_app_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO aurora_app;--> statement-breakpoint

-- Helper: current tenant from transaction-local setting; NULL when unset so policies deny.
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Row-level security. The list of tables here must match drizzle/rls-tables.json
-- (scripts/check-rls.ts fails CI otherwise).
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'roles','role_permissions','membership_roles','user_scope_grants',
    'companies','branches','departments',
    'audit_events','outbox_events','processed_events',
    'module_entitlements','entity_capabilities','tenant_industry_packs','config_install_events',
    'parties','party_roles','party_entity_accounts',
    'uoms','item_categories','items','item_physical_profiles','item_barcodes',
    'warehouses'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE FOR ALL TO aurora_app
         USING (tenant_id = app_current_tenant())
         WITH CHECK (tenant_id = app_current_tenant())', t);
    -- A restrictive policy alone denies everything; pair it with a permissive one so rows that
    -- pass the tenant check are visible. Keeping both makes any later permissive policy still
    -- subject to the tenant restriction.
    EXECUTE format('DROP POLICY IF EXISTS tenant_rows ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_rows ON %I FOR ALL TO aurora_app
         USING (tenant_id = app_current_tenant())
         WITH CHECK (tenant_id = app_current_tenant())', t);
  END LOOP;
END
$$;--> statement-breakpoint

-- memberships: same tenant isolation, plus a user may read their OWN memberships before a
-- tenant is selected (login needs the list of tenants the user belongs to). Writes still
-- require the tenant context.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON memberships;--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships AS RESTRICTIVE FOR ALL TO aurora_app
  USING (tenant_id = app_current_tenant() OR (app_current_tenant() IS NULL AND user_id = app_current_user()))
  WITH CHECK (tenant_id = app_current_tenant());--> statement-breakpoint
DROP POLICY IF EXISTS tenant_rows ON memberships;--> statement-breakpoint
CREATE POLICY tenant_rows ON memberships FOR ALL TO aurora_app
  USING (tenant_id = app_current_tenant() OR (app_current_tenant() IS NULL AND user_id = app_current_user()))
  WITH CHECK (tenant_id = app_current_tenant());--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Grants (least privilege). Platform tables (users, tenants, sessions) are not under RLS and are
-- only reachable through the identity/tenancy modules.
-- ---------------------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON TABLE users, tenants, sessions TO aurora_app;--> statement-breakpoint
GRANT DELETE ON TABLE sessions TO aurora_app;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE
  memberships, roles, companies, branches, departments,
  module_entitlements, entity_capabilities, tenant_industry_packs,
  parties, party_entity_accounts, uoms, item_categories, items, item_physical_profiles, warehouses
TO aurora_app;--> statement-breakpoint

-- Link/assignment tables may be deleted (they are not posted business documents).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  role_permissions, membership_roles, user_scope_grants, party_roles, item_barcodes, item_physical_profiles
TO aurora_app;--> statement-breakpoint

-- Append-only: audit_events, config_install_events. No UPDATE, no DELETE.
GRANT SELECT, INSERT ON TABLE audit_events, config_install_events TO aurora_app;--> statement-breakpoint

-- Outbox: worker marks rows published; nothing is deleted (retention job runs as admin).
GRANT SELECT, INSERT, UPDATE ON TABLE outbox_events TO aurora_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE processed_events TO aurora_app;--> statement-breakpoint

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aurora_app;--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Append-only enforcement as a second line of defence (also protects against an admin slip).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only (operation % rejected)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'P0001';
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_modification();--> statement-breakpoint
DROP TRIGGER IF EXISTS config_install_events_append_only ON config_install_events;--> statement-breakpoint
CREATE TRIGGER config_install_events_append_only BEFORE UPDATE OR DELETE ON config_install_events
  FOR EACH ROW EXECUTE FUNCTION reject_modification();--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Item kind policy: only physical kinds may carry a physical profile or barcodes (ADR-005).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assert_item_is_physical() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  k text;
BEGIN
  SELECT kind INTO k FROM items WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;
  IF k IS NULL THEN
    RAISE EXCEPTION 'item % not found in tenant', NEW.item_id USING ERRCODE = 'P0001';
  END IF;
  IF k IN ('SERVICE','DIGITAL_GOOD','BUNDLE','SUBSCRIPTION_PLAN') THEN
    RAISE EXCEPTION 'item kind % cannot have physical attributes (%)', k, TG_TABLE_NAME USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS item_physical_profiles_kind_guard ON item_physical_profiles;--> statement-breakpoint
CREATE TRIGGER item_physical_profiles_kind_guard BEFORE INSERT OR UPDATE ON item_physical_profiles
  FOR EACH ROW EXECUTE FUNCTION assert_item_is_physical();--> statement-breakpoint
DROP TRIGGER IF EXISTS item_barcodes_kind_guard ON item_barcodes;--> statement-breakpoint
CREATE TRIGGER item_barcodes_kind_guard BEFORE INSERT OR UPDATE ON item_barcodes
  FOR EACH ROW EXECUTE FUNCTION assert_item_is_physical();--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Optimistic concurrency: bump version and updated_at on every UPDATE of a versioned table.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bump_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','tenants','memberships','roles','companies','branches','departments',
    'module_entitlements','entity_capabilities','tenant_industry_packs',
    'parties','party_entity_accounts','uoms','item_categories','items','item_physical_profiles','item_barcodes','warehouses'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_bump_version ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_bump_version BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION bump_version()', t, t);
  END LOOP;
END
$$;

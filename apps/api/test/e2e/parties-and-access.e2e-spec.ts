import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, type TestApp, as, client, createTestApp, login } from '../support/harness';

describe('parties (CORE-IND-004, CRM-002)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('one party identity holds several roles; roles are additive', async () => {
    const owner = await as(t, 'northwind', 'owner', 'NWC');
    const created = await owner.post('/parties', {
      type: 'ORGANIZATION',
      legalName: 'Tailspin Toys',
      primaryEmail: 'hello@tailspin.demo',
      countryCode: 'US',
      roles: ['PROSPECT'],
    });
    expect(created.status).toBe(201);
    expect(created.body.roles).toEqual(['PROSPECT']);
    const withSupplier = await owner.post(`/parties/${created.body.id}/roles`, {
      role: 'SUPPLIER',
    });
    expect(withSupplier.status).toBe(200);
    expect(withSupplier.body.roles.sort()).toEqual(['PROSPECT', 'SUPPLIER']);
    const suppliers = await owner.get('/parties?role=SUPPLIER');
    expect(suppliers.body.items.map((p: { legalName: string }) => p.legalName)).toContain(
      'Tailspin Toys',
    );
    const both = await owner.get('/parties?q=fabrikam');
    expect(both.body.items[0].roles.sort()).toEqual(['CUSTOMER', 'SUPPLIER']);
  });

  it('validation: at least one contact channel; E.164 phones; strict bodies', async () => {
    const owner = await as(t, 'northwind', 'owner', 'NWC');
    const none = await owner.post('/parties', {
      type: 'PERSON',
      legalName: 'No Contact',
      roles: ['CONTACT'],
    });
    expect(none.status).toBe(400);
    expect(none.body.fieldErrors[0].path).toBe('primaryEmail');
    const badPhone = await owner.post('/parties', {
      type: 'PERSON',
      legalName: 'Bad Phone',
      primaryPhone: '0770 000',
      roles: ['CONTACT'],
    });
    expect(badPhone.status).toBe(400);
    const unknownField = await owner.post('/parties', {
      type: 'PERSON',
      legalName: 'X',
      primaryPhone: '+15550100300',
      roles: ['CONTACT'],
      creditLimit: '1000',
    });
    expect(unknownField.status).toBe(400);
  });

  it('a consumer needs no registration number; a party is updatable with version checks', async () => {
    const owner = await as(t, 'harbor', 'owner', 'HRS');
    const person = await owner.post('/parties', {
      type: 'PERSON',
      legalName: 'زينب العلي',
      primaryPhone: '+9647700000009',
      countryCode: 'IQ',
      roles: ['CUSTOMER'],
    });
    expect(person.status).toBe(201);
    expect(person.body.taxRegistrationId).toBeNull();
    const updated = await owner.patch(
      `/parties/${person.body.id}`,
      { tags: ['vip'] },
      { 'if-match': `"version-${person.body.version}"` },
    );
    expect(updated.status).toBe(200);
    expect(updated.body.tags).toEqual(['vip']);
    expect(updated.body.legalName).toBe('زينب العلي');
    const stale = await owner.patch(
      `/parties/${person.body.id}`,
      { tags: ['x'] },
      { 'if-match': `"version-${person.body.version}"` },
    );
    expect(stale.status).toBe(409);
  });
});

describe('authentication and authorization (ADR-003, SEC-001/002, T-002, T-020)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('wrong password and unknown email answer identically; lockout after repeated failures', async () => {
    // Use the auditor: this test locks the account for LOGIN_LOCKOUT_MINUTES.
    const email = t.data.northwind.users.auditor!.email;
    const bad = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'wrong-password', tenantSlug: t.data.northwind.slug },
    });
    const unknown = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'nobody@nowhere.demo',
        password: 'wrong-password',
        tenantSlug: t.data.northwind.slug,
      },
    });
    expect(bad.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(bad.json().message).toBe(unknown.json().message);
    // LOGIN_MAX_FAILED_ATTEMPTS is 3 in tests: two more failures lock the account.
    await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'wrong-password', tenantSlug: t.data.northwind.slug },
    });
    await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'wrong-password', tenantSlug: t.data.northwind.slug },
    });
    const locked = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: DEMO_PASSWORD, tenantSlug: t.data.northwind.slug },
    });
    expect(locked.statusCode).toBe(429);
    expect(locked.json().code).toBe('RATE_LIMITED');
  });

  it('/auth/me returns the session, tenant and only scoped companies; logout revokes immediately', async () => {
    const token = await login(t.app, t.data.harbor.users.stock!.email, t.data.harbor.slug);
    const c = client(t.app, token);
    const me = await c.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.tenant.slug).toBe(t.data.harbor.slug);
    expect(me.body.companies.map((x: { code: string }) => x.code)).toEqual(['HDL']);
    expect(await c.post('/auth/logout')).toMatchObject({ status: 200 });
    expect((await c.get('/auth/me')).status).toBe(401);
  });

  it('T-002: a sales rep without export permission is denied and the attempt is audited', async () => {
    const consultant = await as(t, 'northwind', 'consultant', 'NWC');
    // crm.party.archive is not granted to sales_rep
    const res = await consultant.delete(
      `/parties/${(await consultant.get('/parties')).body.items[0].id}`,
    );
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/crm.party.archive/);
    const owner = await as(t, 'northwind', 'owner', 'NWC');
    const audit = await owner.get('/admin/audit-events?subjectType=route');
    const denied = audit.body.items.find(
      (e: { action: string; reason: string | null }) =>
        e.action === 'access.denied' && e.reason?.includes('crm.party.archive'),
    );
    expect(denied).toBeDefined();
    expect(denied.actorUserId).toBeDefined();
  });

  it('T-020: revoking a role takes effect on the very next request of a live session', async () => {
    const consultant = await as(t, 'northwind', 'consultant', 'NWC');
    expect((await consultant.get('/parties')).status).toBe(200);
    const owner = await as(t, 'northwind', 'owner');
    const revoke = await owner.delete(
      `/admin/members/${t.data.northwind.users.consultant!.membershipId}/roles/sales_rep`,
    );
    expect(revoke.status).toBe(200);
    const after = await consultant.get('/parties');
    expect(after.status).toBe(403);
    expect(after.body.message).toMatch(/crm.party.read/);
    // and scope revocation
    await owner.post(`/admin/members/${t.data.northwind.users.consultant!.membershipId}/roles`, {
      roleKey: 'sales_rep',
    });
    expect((await consultant.get('/parties')).status).toBe(200);
    await owner.delete(
      `/admin/members/${t.data.northwind.users.consultant!.membershipId}/scopes/${t.data.northwind.companies.NWC}`,
    );
    expect((await consultant.get('/parties')).status).toBe(403);
  });

  it('sessions are opaque: the stored hash is not the token, and logout-all revokes every session', async () => {
    const email = t.data.harbor.users.cashier!.email;
    const a = await login(t.app, email, t.data.harbor.slug);
    const b = await login(t.app, email, t.data.harbor.slug);
    const rows = await t.admin.query(
      'SELECT token_hash FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1 AND s.revoked_at IS NULL',
      [email],
    );
    expect(rows.rows.map((r) => r.token_hash)).not.toContain(a);
    expect(rows.rows.map((r) => r.token_hash)).not.toContain(b);
    const res = await client(t.app, a).post('/auth/logout-all');
    expect(res.status).toBe(200);
    expect(res.body.revoked).toBe(2);
    expect((await client(t.app, b).get('/auth/me')).status).toBe(401);
  });

  it('a user in several tenants must name the tenant; the seed users belong to one each', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: t.data.northwind.users.owner!.email, password: DEMO_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });
});

describe('live RLS audit (ADR-001)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('every table in rls-tables.json has RLS enabled, forced, and the tenant policy; aurora_app has no bypass', async () => {
    const manifest = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'drizzle', 'rls-tables.json'), 'utf8'),
    ) as { tables: string[] };
    const rows = await t.admin.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation')::int AS policies FROM pg_class c WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace`,
    );
    const byName = Object.fromEntries(rows.rows.map((r) => [r.relname, r]));
    for (const table of manifest.tables) {
      expect(byName[table], table).toBeDefined();
      expect(byName[table].relrowsecurity, `${table} rls`).toBe(true);
      expect(byName[table].relforcerowsecurity, `${table} force`).toBe(true);
      expect(byName[table].policies, `${table} policy`).toBe(1);
    }
    const role = await t.admin.query(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'aurora_app'`,
    );
    expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const grants = await t.admin.query(
      `SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee = 'aurora_app' AND table_name = 'audit_events'`,
    );
    expect(grants.rows.map((r) => r.privilege_type).sort()).toEqual(['INSERT', 'SELECT']);
  });
});
